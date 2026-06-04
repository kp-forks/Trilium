import "./ImageViewer.css";

import { Ref } from "preact";
import { type ReactZoomPanPinchRef,TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

interface ImageViewerProps {
    src: string;
    imgClassName?: string;
    alt?: string;
    maxScale?: number;
    /** Exposes the zoom/pan instance so the parent can drive zoom in/out/reset. */
    apiRef?: Ref<ReactZoomPanPinchRef>;
}

/**
 * Interactive image viewer: the image is fit to the viewport on load, then the user can zoom
 * (wheel/pinch/buttons) and pan (drag). Double-clicking resets back to the fitted view.
 */
export default function ImageViewer({ src, imgClassName, alt = "", maxScale = 50, apiRef }: ImageViewerProps) {
    return (
        <TransformWrapper
            ref={apiRef}
            maxScale={maxScale}
            centerOnInit
            doubleClick={{ mode: "reset" }}
        >
            <TransformComponent wrapperClass="image-viewer-viewport" contentClass="image-viewer-content">
                <img className={imgClassName} src={src} alt={alt} />
            </TransformComponent>
        </TransformWrapper>
    );
}
