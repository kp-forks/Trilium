import "./ImageViewer.css";

import { Ref } from "preact";
import { useCallback, useRef, useState } from "preact/hooks";
import { type ReactZoomPanPinchRef, TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

import { t } from "../../services/i18n";
import { isMobile } from "../../services/utils";
import { useStaticTooltip } from "./hooks";
import { useImageViewerKeyboard } from "./image_viewer_keyboard";

interface ImageViewerProps {
    src: string;
    imgClassName?: string;
    /** Alt text for the image; callers should pass a descriptive value such as the note title. */
    alt?: string;
    minScale?: number;
    maxScale?: number;
    /** Exposes the zoom/pan instance so the parent can drive zoom in/out/reset. */
    apiRef?: Ref<ReactZoomPanPinchRef>;
}

/** Beyond this multiple of the image's native resolution, switch to crisp (non-smoothed) rendering. */
const CRISP_NATIVE_SCALE = 4;
/** Scale step applied per zoom-in/out button click (react-zoom-pan-pinch's zoomIn/zoomOut step). */
const BUTTON_ZOOM_STEP = 0.5;

/**
 * Derives the zoom-driven values: whether the image is pannable (zoomed past the fitted size),
 * whether it's enlarged beyond {@link CRISP_NATIVE_SCALE}× its native resolution, and `nativeScale` —
 * the on-screen size as a multiple of the image's real pixels (`clientWidth * scale / naturalWidth`,
 * where `clientWidth` is the un-transformed fitted width).
 */
export function evaluateImageZoom(scale: number, img: { naturalWidth: number; clientWidth: number } | null) {
    const nativeScale = img && img.naturalWidth > 0 ? (img.clientWidth * scale) / img.naturalWidth : 0;
    return { pannable: scale > 1, largeZoom: nativeScale > CRISP_NATIVE_SCALE, nativeScale };
}

/**
 * Interactive image viewer: the image is fit to the viewport on load, then the user can zoom
 * (wheel/pinch/buttons/keyboard) and pan (drag/keyboard). Double-clicking resets to the fitted view.
 */
export default function ImageViewer({ src, imgClassName, alt = "", minScale = 0.5, maxScale = 50, apiRef }: ImageViewerProps) {
    const [ pannable, setPannable ] = useState(false);
    const [ panning, setPanning ] = useState(false);
    const [ largeZoom, setLargeZoom ] = useState(false);
    const [ zoomPercent, setZoomPercent ] = useState(0);
    const imgRef = useRef<HTMLImageElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const zoomRef = useRef<ReactZoomPanPinchRef>(null);
    const zoomOutRef = useRef<HTMLButtonElement>(null);
    const zoomLevelRef = useRef<HTMLButtonElement>(null);
    const zoomInRef = useRef<HTMLButtonElement>(null);

    // Keep our own ref to drive keyboard control, while still forwarding to the caller's apiRef.
    const setZoomRef = useCallback((instance: ReactZoomPanPinchRef | null) => {
        zoomRef.current = instance;
        if (typeof apiRef === "function") apiRef(instance);
        else if (apiRef) (apiRef as { current: ReactZoomPanPinchRef | null }).current = instance;
    }, [ apiRef ]);

    useImageViewerKeyboard(zoomRef, rootRef);
    useStaticTooltip(zoomOutRef, { title: t("image_buttons.zoom_out"), placement: "top" });
    useStaticTooltip(zoomLevelRef, { title: t("image_buttons.reset_zoom"), placement: "top" });
    useStaticTooltip(zoomInRef, { title: t("image_buttons.zoom_in"), placement: "top" });

    // Recompute the cursor/rendering flags and the displayed (native-relative) zoom percentage.
    const updateZoomState = (scale: number) => {
        const { pannable: nextPannable, largeZoom: nextLargeZoom, nativeScale } = evaluateImageZoom(scale, imgRef.current);
        if (nextPannable !== pannable) setPannable(nextPannable);
        if (nextLargeZoom !== largeZoom) setLargeZoom(nextLargeZoom);
        const percent = Math.round(nativeScale * 100);
        if (percent !== zoomPercent) setZoomPercent(percent);
    };

    const wrapperClass = [
        "image-viewer-viewport",
        pannable && "pannable",
        panning && "panning",
        largeZoom && "tn-image-large-zoom"
    ].filter(Boolean).join(" ");

    return (
        <div ref={rootRef} tabIndex={0} className="image-viewer-root">
            <TransformWrapper
                ref={setZoomRef}
                minScale={minScale}
                maxScale={maxScale}
                centerOnInit
                centerZoomedOut
                wheel={{ step: 0.0085 }}
                autoAlignment={{ disabled: true }}
                doubleClick={{ mode: "reset" }}
                onTransform={(_ref, { scale }) => updateZoomState(scale)}
                onPanningStart={() => setPanning(true)}
                onPanningStop={() => setPanning(false)}
            >
                <TransformComponent wrapperClass={wrapperClass} contentClass="image-viewer-content">
                    <img
                        ref={imgRef}
                        className={imgClassName}
                        src={src}
                        alt={alt}
                        onLoad={() => updateZoomState(zoomRef.current?.instance.state.scale ?? 1)}
                    />
                </TransformComponent>
            </TransformWrapper>

            {!isMobile() && (
                <div className="image-viewer-controls">
                    <button
                        ref={zoomOutRef}
                        className="icon-action bx bx-zoom-out"
                        onClick={() => zoomRef.current?.zoomOut(BUTTON_ZOOM_STEP)}
                    />
                    <button
                        ref={zoomLevelRef}
                        className="image-viewer-zoom-level"
                        onClick={() => zoomRef.current?.resetTransform()}
                    >
                        {zoomPercent}%
                    </button>
                    <button
                        ref={zoomInRef}
                        className="icon-action bx bx-zoom-in"
                        onClick={() => zoomRef.current?.zoomIn(BUTTON_ZOOM_STEP)}
                    />
                </div>
            )}
        </div>
    );
}
