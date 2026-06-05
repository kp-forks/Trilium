import { type ComponentChildren, render } from "preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture the props handed to the zoom library without mounting it (it needs real layout).
const { transformWrapperSpy } = vi.hoisted(() => ({ transformWrapperSpy: vi.fn() }));

vi.mock("react-zoom-pan-pinch", () => ({
    TransformWrapper: (props: { children?: ComponentChildren }) => {
        transformWrapperSpy(props);
        return props.children;
    },
    TransformComponent: (props: { children?: ComponentChildren }) => props.children
}));

import ImageViewer, { evaluateImageZoom } from "./ImageViewer";

function renderViewer(props: Parameters<typeof ImageViewer>[0]) {
    const container = document.createElement("div");
    render(<ImageViewer {...props} />, container);
    return container;
}

describe("ImageViewer", () => {
    beforeEach(() => transformWrapperSpy.mockClear());

    it("renders the image with the given src, alt and class", () => {
        const container = renderViewer({ src: "api/images/abc/Pic", imgClassName: "note-detail-image-view", alt: "Pic" });
        const img = container.querySelector("img");
        expect(img).not.toBeNull();
        expect(img?.getAttribute("src")).toBe("api/images/abc/Pic");
        expect(img?.getAttribute("alt")).toBe("Pic");
        expect(img?.className).toBe("note-detail-image-view");
    });

    it("wires up the interactive zoom behavior", () => {
        renderViewer({ src: "x" });
        const props = transformWrapperSpy.mock.calls[0][0];
        expect(props.centerOnInit).toBe(true);
        expect(props.centerZoomedOut).toBe(true);
        expect(props.autoAlignment).toEqual({ disabled: true });
        expect(props.doubleClick).toEqual({ mode: "reset" });
        // Numeric envelope is user-tunable — assert sane relationships, not exact values.
        expect(props.maxScale).toBeGreaterThan(props.minScale);
        expect(props.wheel.step).toBeGreaterThan(0);
    });

    it("lets minScale and maxScale be overridden", () => {
        renderViewer({ src: "x", minScale: 1, maxScale: 8 });
        const props = transformWrapperSpy.mock.calls[0][0];
        expect(props.minScale).toBe(1);
        expect(props.maxScale).toBe(8);
    });
});

describe("evaluateImageZoom", () => {
    const img = (naturalWidth: number, clientWidth: number) => ({ naturalWidth, clientWidth });

    it("is pannable only once zoomed past the fitted size", () => {
        expect(evaluateImageZoom(0.5, img(800, 800)).pannable).toBe(false);
        expect(evaluateImageZoom(1, img(800, 800)).pannable).toBe(false);
        expect(evaluateImageZoom(1.5, img(800, 800)).pannable).toBe(true);
    });

    it("goes crisp only past 4x native for a downscaled image", () => {
        // native 4000 fitted to 800 => 1x native at scale 5, exactly 4x native at scale 20
        expect(evaluateImageZoom(5, img(4000, 800)).largeZoom).toBe(false);
        expect(evaluateImageZoom(20, img(4000, 800)).largeZoom).toBe(false);
        expect(evaluateImageZoom(21, img(4000, 800)).largeZoom).toBe(true);
    });

    it("goes crisp past 4x scale for an image shown at native size", () => {
        // native 200 shown at 200 => exactly 4x native at scale 4
        expect(evaluateImageZoom(4, img(200, 200)).largeZoom).toBe(false);
        expect(evaluateImageZoom(5, img(200, 200)).largeZoom).toBe(true);
    });

    it("never goes crisp when the image is missing or not yet loaded", () => {
        expect(evaluateImageZoom(50, null).largeZoom).toBe(false);
        expect(evaluateImageZoom(50, img(0, 800)).largeZoom).toBe(false);
    });
});
