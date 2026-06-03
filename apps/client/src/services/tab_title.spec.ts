import { describe, expect, it } from "vitest";

import { buildTabTitle, TAB_TITLE_SEPARATOR } from "./tab_title.js";

describe("buildTabTitle", () => {
    it("joins split titles with the separator and preserves each segment's active flag", () => {
        const { segments, tooltip } = buildTabTitle(
            [
                { title: "Inbox", active: false },
                { title: "Tasks", active: true }
            ],
            "New tab"
        );

        expect(segments).toEqual([
            { text: "Inbox", active: false },
            { text: "Tasks", active: true }
        ]);
        expect(tooltip).toBe(`Inbox${TAB_TITLE_SEPARATOR}Tasks`);
    });

    it("falls back to the empty label for empty/untitled splits", () => {
        const { segments, tooltip } = buildTabTitle(
            [
                { title: "Inbox", active: false },
                { title: null, active: true },
                { title: "", active: false },
                { title: undefined, active: false }
            ],
            "New tab"
        );

        expect(segments.map((s) => s.text)).toEqual(["Inbox", "New tab", "New tab", "New tab"]);
        expect(tooltip).toBe("Inbox • New tab • New tab • New tab");
    });

    it("produces a single segment with no separator for a single split", () => {
        const { segments, tooltip } = buildTabTitle([{ title: "Solo", active: true }], "New tab");

        expect(segments).toHaveLength(1);
        expect(tooltip).toBe("Solo");
    });

    it("handles an empty split list", () => {
        const { segments, tooltip } = buildTabTitle([], "New tab");

        expect(segments).toEqual([]);
        expect(tooltip).toBe("");
    });
});
