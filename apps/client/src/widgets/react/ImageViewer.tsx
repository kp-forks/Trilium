import "./ImageViewer.css";

import { Ref } from "preact";
import { type ReactZoomPanPinchRef,TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

interface ImageViewerProps {
    src: string;
    imgClassName?: string;
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
        >
            <TransformComponent wrapperClass="image-viewer-viewport" contentClass="image-viewer-content">
                <img className={imgClassName} src={src} alt={alt} />
            </TransformComponent>
        </TransformWrapper>
    );
}
