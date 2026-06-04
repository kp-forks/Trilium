import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { describe, expect, it, vi } from "vitest";

import { applyImageZoom } from "./image_zoom";

function stubZoom() {
    return { zoomIn: vi.fn(), zoomOut: vi.fn(), resetTransform: vi.fn() };
}

const asRef = (zoom: ReturnType<typeof stubZoom>) => zoom as unknown as ReactZoomPanPinchRef;

describe("applyImageZoom", () => {
    it("routes each event to its matching zoom action", () => {
        const zoomIn = stubZoom();
        applyImageZoom(asRef(zoomIn), "imageZoomIn", "ntx", "ntx");
        expect(zoomIn.zoomIn).toHaveBeenCalledOnce();
        expect(zoomIn.zoomOut).not.toHaveBeenCalled();
        expect(zoomIn.resetTransform).not.toHaveBeenCalled();

        const zoomOut = stubZoom();
        applyImageZoom(asRef(zoomOut), "imageZoomOut", "ntx", "ntx");
        expect(zoomOut.zoomOut).toHaveBeenCalledOnce();
        expect(zoomOut.zoomIn).not.toHaveBeenCalled();
        expect(zoomOut.resetTransform).not.toHaveBeenCalled();

        const reset = stubZoom();
        applyImageZoom(asRef(reset), "imageZoomReset", "ntx", "ntx");
        expect(reset.resetTransform).toHaveBeenCalledOnce();
        expect(reset.zoomIn).not.toHaveBeenCalled();
        expect(reset.zoomOut).not.toHaveBeenCalled();
    });

    it("zooms in and out by the same configured step", () => {
        const zoom = stubZoom();
        applyImageZoom(asRef(zoom), "imageZoomIn", "ntx", "ntx");
        applyImageZoom(asRef(zoom), "imageZoomOut", "ntx", "ntx");
        const inStep = zoom.zoomIn.mock.calls[0][0];
        const outStep = zoom.zoomOut.mock.calls[0][0];
        expect(inStep).toBeTypeOf("number");
        expect(inStep).toBe(outStep);
    });

    it("ignores events from a different note context", () => {
        const zoom = stubZoom();
        applyImageZoom(asRef(zoom), "imageZoomIn", "ntx-a", "ntx-b");
        expect(zoom.zoomIn).not.toHaveBeenCalled();
    });

    it("is a no-op when the zoom instance is not ready", () => {
        expect(() => applyImageZoom(null, "imageZoomReset", "ntx", "ntx")).not.toThrow();
    });
});
