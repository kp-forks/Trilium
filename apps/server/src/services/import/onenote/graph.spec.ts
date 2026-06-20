import { describe, expect, it } from "vitest";

import { retryDelayMs } from "./graph.js";

describe("retryDelayMs", () => {
    it("honours a numeric Retry-After header (seconds → ms)", () => {
        expect(retryDelayMs("3", 0)).toBe(3000);
    });

    it("falls back to exponential backoff when the header is absent or non-numeric", () => {
        expect(retryDelayMs(null, 0)).toBe(2000);
        expect(retryDelayMs(null, 1)).toBe(4000);
        expect(retryDelayMs("soon", 2)).toBe(8000);
    });

    it("caps the delay at the maximum", () => {
        // Both a huge Retry-After and a far-out backoff attempt clamp to the 30s ceiling.
        expect(retryDelayMs("3600", 0)).toBe(30_000);
        expect(retryDelayMs(null, 10)).toBe(30_000);
    });
});
