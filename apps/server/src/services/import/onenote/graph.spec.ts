import { describe, expect, it } from "vitest";

import { backoffDelayMs, extractGraphErrorDetail } from "./graph.js";

describe("backoffDelayMs", () => {
    it("doubles the delay with each attempt", () => {
        expect(backoffDelayMs(0)).toBe(2000);
        expect(backoffDelayMs(1)).toBe(4000);
        expect(backoffDelayMs(2)).toBe(8000);
        expect(backoffDelayMs(3)).toBe(16000);
    });

    it("caps the delay at the maximum", () => {
        expect(backoffDelayMs(10)).toBe(30_000);
    });
});

describe("extractGraphErrorDetail", () => {
    it("extracts code and message from Graph's error envelope", () => {
        expect(extractGraphErrorDetail(JSON.stringify({ error: { code: "20102", message: "The specified resource ID does not exist." } })))
            .toBe("20102: The specified resource ID does not exist.");
        expect(extractGraphErrorDetail(JSON.stringify({ error: { message: "Something went wrong." } }))).toBe("Something went wrong.");
        expect(extractGraphErrorDetail(JSON.stringify({ error: { code: "ItemNotFound" } }))).toBe("ItemNotFound");
    });

    it("returns an empty string for bodies that are not a Graph error envelope", () => {
        expect(extractGraphErrorDetail("")).toBe("");
        expect(extractGraphErrorDetail("<html>Not Found</html>")).toBe("");
        expect(extractGraphErrorDetail("null")).toBe("");
        expect(extractGraphErrorDetail(JSON.stringify({ unrelated: true }))).toBe("");
    });
});
