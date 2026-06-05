import "./ImageViewer.css";

import { Ref } from "preact";
import { useRef, useState } from "preact/hooks";
import { type ReactZoomPanPinchRef, TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

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

/**
 * Derives the zoom-driven flags: whether the image is pannable (zoomed past the fitted size) and
 * whether it's enlarged beyond {@link CRISP_NATIVE_SCALE}× its native resolution. `clientWidth` is
 * the un-transformed fitted width, so `clientWidth * scale / naturalWidth` is the on-screen size in
 * multiples of the image's real pixels.
 */
export function evaluateImageZoom(scale: number, img: { naturalWidth: number; clientWidth: number } | null) {
    const pannable = scale > 1;
    const nativeScale = img && img.naturalWidth > 0 ? (img.clientWidth * scale) / img.naturalWidth : 0;
    return { pannable, largeZoom: nativeScale > CRISP_NATIVE_SCALE };
}

/**
 * Interactive image viewer: the image is fit to the viewport on load, then the user can zoom
 * (wheel/pinch/buttons) and pan (drag). Double-clicking resets back to the fitted view.
 */
export default function ImageViewer({ src, imgClassName, alt = "", minScale = 0.5, maxScale = 50, apiRef }: ImageViewerProps) {
    const [ pannable, setPannable ] = useState(false);
    const [ panning, setPanning ] = useState(false);
    const [ largeZoom, setLargeZoom ] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    const wrapperClass = [
        "image-viewer-viewport",
        pannable && "pannable",
        panning && "panning",
        largeZoom && "tn-image-large-zoom"
    ].filter(Boolean).join(" ");

    return (
        <TransformWrapper
            ref={apiRef}
            minScale={minScale}
            maxScale={maxScale}
            centerOnInit
            centerZoomedOut
            wheel={{ step: 0.0085 }}
            autoAlignment={{ disabled: true }}
            doubleClick={{ mode: "reset" }}
            onTransform={(_ref, { scale }) => {
                const { pannable, largeZoom } = evaluateImageZoom(scale, imgRef.current);
                setPannable(pannable);
                setLargeZoom(largeZoom);
            }}
            onPanningStart={() => setPanning(true)}
            onPanningStop={() => setPanning(false)}
        >
            <TransformComponent wrapperClass={wrapperClass} contentClass="image-viewer-content">
                <img ref={imgRef} className={imgClassName} src={src} alt={alt} />
            </TransformComponent>
        </TransformWrapper>
    );
}
