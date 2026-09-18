import { describe, expect, it } from "vitest";

import { wheelStep, zoomStep } from "./zoom_pan";

describe("zoomStep", () => {
    it("is the increment react-zoom-pan-pinch needs for a ×1.2 step, at any scale", () => {
        // The library adds the step to the current scale, so what is asserted is where each press
        // lands rather than the increment itself.
        expect(1 + zoomStep(1, "in")).toBeCloseTo(1.2);
        expect(1 - zoomStep(1, "out")).toBeCloseTo(1 / 1.2);

        // A fixed increment would be a leap here and a crawl at the other end; these stay a fifth
        // of what is on screen apart.
        expect(0.6 + zoomStep(0.6, "in")).toBeCloseTo(0.72);
        expect(8 + zoomStep(8, "in")).toBeCloseTo(9.6);

        // A step out undoes a step in, so the readout returns to where it started.
        const zoomedIn = 3 + zoomStep(3, "in");
        expect(zoomedIn - zoomStep(zoomedIn, "out")).toBeCloseTo(3);
    });
});

describe("wheelStep", () => {
    it("makes a notch the same tenth of the view at any scale", () => {
        // The library adds `step * |deltaY|` to the scale, so a notch is asserted where it lands.
        const notch = (scale: number, deltaY = 100) => scale + wheelStep(scale) * deltaY;

        expect(notch(0.5)).toBeCloseTo(0.55);
        expect(notch(8)).toBeCloseTo(8.8);

        // The library's own default step would have put that first notch on 2.0 — a diagram fitted
        // at 50% jumping past 200% on one scroll.
        expect(0.5 + 0.015 * 100).toBe(2);
        expect(notch(0.5)).toBeLessThan(0.6);

        // A trackpad reports a fraction of a notch, and moves the view by that same fraction.
        expect(notch(1, 10)).toBeCloseTo(1.01);
    });
});
