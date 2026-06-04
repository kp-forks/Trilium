import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

/** Scale factor applied per zoom-in/out button click (react-zoom-pan-pinch's zoomIn/zoomOut step). */
export const IMAGE_ZOOM_STEP = 0.5;

export type ImageZoomEvent = "imageZoomIn" | "imageZoomOut" | "imageZoomReset";

/** Routes an image-zoom event to the matching zoom action, scoped to the originating note context. */
export function applyImageZoom(
    zoom: ReactZoomPanPinchRef | null,
    eventName: ImageZoomEvent,
    eventNtxId: string | null | undefined,
    ntxId: string | null | undefined
) {
    if (!zoom || eventNtxId !== ntxId) return;

    if (eventName === "imageZoomIn") zoom.zoomIn(IMAGE_ZOOM_STEP);
    else if (eventName === "imageZoomOut") zoom.zoomOut(IMAGE_ZOOM_STEP);
    else zoom.resetTransform();
}
