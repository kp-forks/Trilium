import { describe, expect, it } from "vitest";

import { zoomStep } from "./zoom_pan";

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
