import { RefObject } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { type ReactZoomPanPinchRef, TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

import { t } from "../../../services/i18n";
import server from "../../../services/server";
import toast from "../../../services/toast";
import utils from "../../../services/utils";
import { useTriliumEvent } from "../../react/hooks";
import OverlayControlGroup, { OverlayControlButton } from "../../react/OverlayControlGroup";
import { RawHtmlBlock } from "../../react/RawHtml";
import SplitEditor, { SplitEditorProps } from "./SplitEditor";

interface SvgSplitEditorProps extends Omit<SplitEditorProps, "previewContent"> {
    /**
     * The title of the note attachment used for storing the preview, extension included. Take it from
     * `NOTE_TYPE_IMAGE_ATTACHMENTS` so that the `api/images` endpoints can find it again.
     */
    attachmentTitle: string;
    /**
     * Called upon when the SVG preview needs refreshing, such as when the editor has switched to a new note or the content has switched.
     *
     * The method must return a valid SVG string that will be automatically displayed in the preview.
     *
     * @param content the content of the note, in plain text.
     */
    renderSvg(content: string): string | Promise<string>;
}

/**
 * A specialization of `SplitTypeWidget` meant for note types that have a SVG preview.
 *
 * This adds the following functionality:
 *
 * - Automatic handling of the preview when content or the note changes via {@link renderSvg}.
 * - Built-in pan and zoom functionality with automatic re-centering.
 * - Automatically displays errors to the user if {@link renderSvg} failed.
 * - Automatically saves the SVG attachment.
 *
 */
export default function SvgSplitEditor({ ntxId, note, attachmentTitle, renderSvg, ...props }: SvgSplitEditorProps) {
    const [ svg, setSvg ] = useState<string>();
    const [ error, setError ] = useState<string | null | undefined>();
    const [ zoom, setZoom ] = useState(1);
    const zoomRef = useRef<ReactZoomPanPinchRef>(null);

    // Reset the render state when switching notes so a previous note's render (and the
    // "showing last valid render" badge) can't briefly carry over to a different note.
    useEffect(() => {
        setSvg(undefined);
        setError(undefined);
        setZoom(1);
    }, [ note.noteId ]);

    // Render the SVG.
    async function onContentChanged(content: string) {
        try {
            const svg = await renderSvg(content);

            // Rendering was successful.
            setError(null);
            setSvg(svg);
        } catch (e) {
            // Rendering failed.
            setError((e as Error)?.message);
        }
    }

    // Save as attachment.
    const onSave = useCallback(() => {
        if (!svg) return; // Don't save if SVG hasn't been rendered yet

        const payload = {
            role: "image",
            title: attachmentTitle,
            mime: "image/svg+xml",
            content: svg,
            position: 0
        };

        server.post(`notes/${note.noteId}/attachments?matchBy=title`, payload);
    }, [ svg, attachmentTitle, note.noteId ]);

    // Save the SVG when entering a note only when it does not have an attachment.
    useEffect(() => {
        if (!svg) return; // Wait until SVG is rendered

        note?.getAttachments().then((attachments) => {
            if (!attachments.find((a) => a.title === attachmentTitle)) {
                onSave();
            }
        }).catch(e => console.error("Failed to get attachments for SVGSplitEditor", e));
    }, [ note, svg, attachmentTitle, onSave ]);

    // Import/export. The renderer's `svg` string is exported rather than the on-screen element, so
    // the export never carries what the preview did to fit the diagram into its pane.
    useTriliumEvent("exportSvg", ({ ntxId: eventNtxId }) => {
        if (eventNtxId !== ntxId || !svg) return;

        try {
            utils.downloadSvg(note.title, svg);
        } catch (e) {
            console.warn(e);
            toast.showError(t("svg.export_to_svg"));
        }
    });

    useTriliumEvent("exportPng", async ({ ntxId: eventNtxId }) => {
        if (eventNtxId !== ntxId || !svg) return;
        try {
            await utils.downloadSvgAsPng(note.title, svg);
        } catch (e) {
            console.warn(e);
            toast.showError(t("svg.export_to_png"));
        }
    });

    return (
        <SplitEditor
            className="svg-editor"
            note={note} ntxId={ntxId}
            error={error}
            previewStale={!!svg}
            onContentChanged={onContentChanged}
            dataSaved={onSave}
            placeholder={t("mermaid.placeholder")}
            previewContent={(
                <TransformWrapper
                    // The transform sits on an ancestor of the diagram, so it survives a re-render
                    // of the same note. Keying it on the note drops it when a different one opens.
                    key={note.noteId}
                    ref={zoomRef}
                    minScale={MIN_ZOOM}
                    maxScale={MAX_ZOOM}
                    centerOnInit
                    centerZoomedOut
                    doubleClick={{ mode: "reset" }}
                    onTransform={(_ref, { scale }) => setZoom(scale)}
                >
                    <TransformComponent wrapperClass="svg-preview-viewport" contentClass="svg-preview-content">
                        <RawHtmlBlock className="render-container" html={svg} />
                    </TransformComponent>
                </TransformWrapper>
            )}
            previewButtons={!!svg && <PreviewControls zoomRef={zoomRef} zoom={zoom} />}
            {...props}
        />
    );
}

/**
 * How far in and out the diagram can be taken, as a multiple of the view it opened at.
 *
 * CSS fits the SVG to the preview pane through its `viewBox` and `preserveAspectRatio` (see the SVG
 * section of SplitEditor.css), so a scale of 1 already is that fitted view and these bounds need no
 * measurement of their own.
 */
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 10;
/** What one press of a zoom step multiplies the scale by. */
const ZOOM_STEP = 1.2;
/**
 * How near a bound counts as being on it. The zoom animation reaches its target by adding the whole
 * difference back to the scale it started from, which can land a float's width short of the bound.
 */
const ZOOM_LIMIT_TOLERANCE = 1e-6;

/**
 * The zoom controls in the corner of the rendered diagram: a step in each direction, and between
 * them a readout that fits the diagram back to the pane when pressed.
 *
 * They stand on the {@link OverlayControlGroup} the image viewer's zoom buttons stand on, as the
 * two maps' controls do. The readout is a percentage of the fitted view, so a diagram opens at 100%.
 */
function PreviewControls({ zoomRef, zoom }: { zoomRef: RefObject<ReactZoomPanPinchRef>; zoom: number }) {
    return (
        <OverlayControlGroup className="svg-preview-controls" placement="bottom-end">
            <OverlayControlButton
                title={t("svg.zoom_out")}
                icon="bx-minus-circle"
                disabled={zoom <= MIN_ZOOM * (1 + ZOOM_LIMIT_TOLERANCE)}
                onClick={() => zoomRef.current?.zoomOut(zoomStep(zoom, "out"))}
            />
            <OverlayControlButton
                title={t("svg.reset_zoom")}
                text={`${Math.round(zoom * 100)}%`}
                onClick={() => zoomRef.current?.resetTransform()}
            />
            <OverlayControlButton
                title={t("svg.zoom_in")}
                icon="bx-plus-circle"
                disabled={zoom >= MAX_ZOOM * (1 - ZOOM_LIMIT_TOLERANCE)}
                onClick={() => zoomRef.current?.zoomIn(zoomStep(zoom, "in"))}
            />
        </OverlayControlGroup>
    );
}

/**
 * The increment that takes `scale` one {@link ZOOM_STEP} in the given direction.
 *
 * react-zoom-pan-pinch adds the step to the current scale, so a fixed step would be a leap at the
 * bottom of the range and a crawl at the top. Scaling the step by the scale it applies to keeps
 * every press the same proportion of what is on screen.
 */
function zoomStep(scale: number, direction: "in" | "out") {
    return direction === "in" ? scale * (ZOOM_STEP - 1) : scale * (1 - 1 / ZOOM_STEP);
}
