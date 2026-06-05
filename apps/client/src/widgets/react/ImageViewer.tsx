import "./ImageViewer.css";

import { Ref } from "preact";
import { useState } from "preact/hooks";
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

/**
 * Interactive image viewer: the image is fit to the viewport on load, then the user can zoom
 * (wheel/pinch/buttons) and pan (drag). Double-clicking resets back to the fitted view.
 */
export default function ImageViewer({ src, imgClassName, alt = "", minScale = 0.5, maxScale = 50, apiRef }: ImageViewerProps) {
    const [ pannable, setPannable ] = useState(false);
    const [ panning, setPanning ] = useState(false);

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
            onTransform={(_ref, { scale }) => setPannable(scale > 1)}
            onPanningStart={() => setPanning(true)}
            onPanningStop={() => setPanning(false)}
        >
            <TransformComponent wrapperClass={`image-viewer-viewport${pannable ? " pannable" : ""}${panning ? " panning" : ""}`} contentClass="image-viewer-content">
                <img className={imgClassName} src={src} alt={alt} />
            </TransformComponent>
        </TransformWrapper>
    );
}
