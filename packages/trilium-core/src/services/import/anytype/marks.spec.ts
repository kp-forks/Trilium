import { describe, expect, it } from "vitest";

import { renderInlineText } from "./marks.js";
import type { AnytypeMark } from "./model.js";

function mark(from: number, to: number, type: string, param?: string): AnytypeMark {
    return { range: { from, to }, type, param };
}

describe("renderInlineText", () => {
    it("returns escaped plain text when there are no marks", () => {
        expect(renderInlineText("a < b & c > d", [])).toBe("a &lt; b &amp; c &gt; d");
    });

    it("wraps a single mark's range, leaving the rest untouched", () => {
        expect(renderInlineText("Bold text", [mark(0, 4, "Bold")])).toBe("<strong>Bold</strong> text");
    });

    it("maps the five supported marks to their tags ([from, to) range)", () => {
        expect(renderInlineText("x", [mark(0, 1, "Bold")])).toBe("<strong>x</strong>");
        expect(renderInlineText("x", [mark(0, 1, "Italic")])).toBe("<em>x</em>");
        expect(renderInlineText("x", [mark(0, 1, "Strikethrough")])).toBe("<s>x</s>");
        expect(renderInlineText("x", [mark(0, 1, "Underscored")])).toBe("<u>x</u>");
        expect(renderInlineText("x", [mark(0, 1, "Keyboard")])).toBe("<code>x</code>");
    });

    it("renders the real 'Formatting test' line, nesting coincident bold+italic+underline", () => {
        // Verbatim text and marks from the exported page (marks intentionally unsorted, as in the export).
        const text = "Bold Italic Strikethrough Underline Bold Italic Underline";
        const marks = [
            mark(12, 25, "Strikethrough"),
            mark(5, 11, "Italic"),
            mark(36, 57, "Italic"),
            mark(0, 4, "Bold"),
            mark(36, 57, "Bold"),
            mark(26, 35, "Underscored"),
            mark(36, 57, "Underscored")
        ];
        expect(renderInlineText(text, marks)).toBe(
            "<strong>Bold</strong> <em>Italic</em> <s>Strikethrough</s> <u>Underline</u> <strong><em><u>Bold Italic Underline</u></em></strong>"
        );
    });

    it("splits partially overlapping marks into properly nested segments", () => {
        // Bold [0,4) and Italic [2,6) overlap only on [2,4).
        expect(renderInlineText("abcdef", [mark(0, 4, "Bold"), mark(2, 6, "Italic")])).toBe(
            "<strong>ab</strong><strong><em>cd</em></strong><em>ef</em>"
        );
    });

    it("ignores unsupported mark types, keeping their text as plain (escaped) content", () => {
        expect(renderInlineText("Grey", [mark(0, 4, "TextColor", "grey")])).toBe("Grey");
    });

    it("escapes HTML inside a marked range", () => {
        expect(renderInlineText("a<b", [mark(0, 3, "Bold")])).toBe("<strong>a&lt;b</strong>");
    });

    it("clamps out-of-range offsets and drops empty / reversed ranges", () => {
        expect(renderInlineText("hi", [mark(0, 100, "Bold")])).toBe("<strong>hi</strong>");
        expect(renderInlineText("hi", [mark(1, 1, "Bold")])).toBe("hi");
        expect(renderInlineText("hi", [mark(2, 0, "Bold")])).toBe("hi");
    });
});
