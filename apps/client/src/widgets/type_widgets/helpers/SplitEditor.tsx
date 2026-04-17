import "./SplitEditor.css";

import Split from "@triliumnext/split.js";
import { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

import { DEFAULT_GUTTER_SIZE } from "../../../services/resizer";
import utils, { isMobile } from "../../../services/utils";
import ActionButton, { ActionButtonProps } from "../../react/ActionButton";
import Admonition from "../../react/Admonition";
import { useNoteBlob, useNoteLabel, useNoteLabelBoolean, useTriliumOption } from "../../react/hooks";
import { EditableCode, EditableCodeProps } from "../code/Code";

export interface SplitEditorProps extends EditableCodeProps {
    className?: string;
    error?: string | null;
    splitOptions?: Split.Options;
    previewContent: ComponentChildren;
    previewButtons?: ComponentChildren;
    editorBefore?: ComponentChildren;
    forceOrientation?: "horizontal" | "vertical";
    extraContent?: ComponentChildren;
}

/**
 * Abstract `TypeWidget` which contains a preview and editor pane, each displayed on half of the available screen.
 *
 * The active view is driven by the `#displayMode` label (`source`, `split`, `preview`); when unset
 * it falls back to the `#readOnly` label (truthy → preview, falsy → split). `#displayMode` always
 * wins so an explicit choice is never overridden by `#readOnly`. The editor and preview panes are
 * always mounted; switching modes only toggles a CSS class so CodeMirror state, scroll position and
 * pending edits survive the change.
 *
 * Features:
 *
 * - The two panes are resizeable via a split, on desktop. The split can be optionally customized via {@link buildSplitExtraOptions}.
 * - Can display errors to the user via {@link setError}.
 * - Horizontal or vertical orientation for the editor/preview split, adjustable via the switch split orientation button floating button.
 */
export default function SplitEditor({ note, error, splitOptions, previewContent, previewButtons, className, editorBefore, forceOrientation, extraContent, ...editorProps }: SplitEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const splitEditorOrientation = useSplitOrientation(forceOrientation);
    const [ displayMode ] = useNoteLabel(note, "displayMode");
    const [ readOnly ] = useNoteLabelBoolean(note, "readOnly");
    const mode = displayMode === "source" || displayMode === "split" || displayMode === "preview"
        ? displayMode
        : readOnly ? "preview" : "split";

    // Lazy-mount each pane on first need, then keep it mounted so subsequent switches stay instant.
    const editorMounted = useRef(mode !== "preview");
    const previewMounted = useRef(mode !== "source");
    if (mode !== "preview") editorMounted.current = true;
    if (mode !== "source") previewMounted.current = true;

    // While the editor isn't mounted, the preview has no source for its content — feed it from the
    // blob directly. Once the editor mounts (and stays mounted), it takes over and this short-circuits.
    const fallbackBlob = useNoteBlob(editorMounted.current ? null : note);
    const onContentChangedRef = useRef(editorProps.onContentChanged);
    useEffect(() => { onContentChangedRef.current = editorProps.onContentChanged; });
    useEffect(() => {
        if (!editorMounted.current && fallbackBlob) {
            onContentChangedRef.current?.(fallbackBlob.content ?? "");
        }
    }, [ fallbackBlob ]);

    const editor = editorMounted.current && (
        <div className="note-detail-split-editor-col">
            {editorBefore}
            <div className="note-detail-split-editor">
                <EditableCode
                    note={note}
                    lineWrapping={false}
                    updateInterval={750} debounceUpdate
                    noBackgroundChange
                    {...editorProps}
                />
            </div>
            {error && (
                <Admonition type="caution" className="note-detail-error-container">
                    {error}
                </Admonition>
            )}
            {extraContent}
        </div>
    );

    const preview = previewMounted.current && <PreviewContainer
        error={error}
        previewContent={previewContent}
        previewButtons={previewButtons}
    />;

    useEffect(() => {
        if (mode !== "split" || !utils.isDesktop() || !containerRef.current) return;
        // Only the visible (non-display:none) panes participate in the split.
        const elements = (Array.from(containerRef.current.children) as HTMLElement[])
            .filter(el => el.offsetParent !== null);
        const splitInstance = Split(elements, {
            rtl: glob.isRtl,
            sizes: [ 50, 50 ],
            direction: splitEditorOrientation,
            gutterSize: DEFAULT_GUTTER_SIZE,
            ...splitOptions
        });

        return () => splitInstance.destroy();
    }, [ splitEditorOrientation, mode ]);

    const layoutClass = mode === "source" ? "split-source-only"
        : mode === "preview" ? "split-read-only"
        : `split-${splitEditorOrientation}`;

    return (
        <div ref={containerRef} className={`note-detail-split note-detail-printable ${layoutClass} ${className ?? ""}`}>
            {splitEditorOrientation === "horizontal"
                ? <>{editor}{preview}</>
                : <>{preview}{editor}</>}
        </div>
    );
}

function PreviewContainer({ error, previewContent, previewButtons }: {
    error?: string | null;
    previewContent: ComponentChildren;
    previewButtons?: ComponentChildren;
}) {
    return (
        <div className="note-detail-split-preview-col">
            <div className={`note-detail-split-preview ${error ? "on-error" : ""}`}>
                {previewContent}
            </div>
            <div className="btn-group btn-group-sm map-type-switcher content-floating-buttons preview-buttons bottom-right" role="group">
                {previewButtons}
            </div>
        </div>
    );
}

export function PreviewButton(props: Omit<ActionButtonProps, "titlePosition">) {
    return <ActionButton
        {...props}
        className="tn-tool-button"
        noIconActionClass
        titlePosition="top"
    />;
}

function useSplitOrientation(forceOrientation?: "horizontal" | "vertical") {
    const [ splitEditorOrientation ] = useTriliumOption("splitEditorOrientation");
    if (forceOrientation) return forceOrientation;
    if (isMobile()) return "vertical";
    if (!splitEditorOrientation) return "horizontal";
    return splitEditorOrientation as "horizontal" | "vertical";
}
