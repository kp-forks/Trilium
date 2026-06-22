import { describe, expect, it } from "vitest";

import { demoteHeadings } from "./heading_demotion.js";

/** Identity decoder — keeps the heading text verbatim. */
const verbatim = (s: string) => s;

describe("demoteHeadings", () => {
    it("leaves content untouched when there is no <h1>", () => {
        expect(demoteHeadings("<h2>A</h2><h3>B</h3>", "Title", verbatim)).toBe("<h2>A</h2><h3>B</h3>");
    });

    it("strips the leading <h1> that duplicates the title without shifting the rest", () => {
        // The common case: title removed, content already starts at <h2>.
        expect(demoteHeadings("<h1>Title</h1><h2>A</h2><h3>B</h3>", "Title", verbatim))
            .toBe("<h2>A</h2><h3>B</h3>");
    });

    it("shifts the whole hierarchy down one level when a content <h1> remains", () => {
        // Top-level <h1> and nested <h2> stay distinct instead of both becoming <h2>.
        expect(demoteHeadings("<h1>A</h1><h2>B</h2><h3>C</h3>", "Title", verbatim))
            .toBe("<h2>A</h2><h3>B</h3><h4>C</h4>");
        // Title stripped, but a remaining content <h1> still triggers the shift.
        expect(demoteHeadings("<h1>Title</h1><h1>Chapter</h1><h2>Section</h2>", "Title", verbatim))
            .toBe("<h2>Chapter</h2><h3>Section</h3>");
    });

    it("clamps at <h6> since there is no <h7>", () => {
        expect(demoteHeadings("<h1>A</h1><h5>E</h5><h6>F</h6>", "Title", verbatim))
            .toBe("<h2>A</h2><h6>E</h6><h6>F</h6>");
    });

    it("matches headings with inline markup and carries attributes onto the demoted <h2>", () => {
        expect(demoteHeadings("<h1>Chapter <em>One</em></h1><h2>Intro</h2>", "Title", verbatim))
            .toBe("<h2>Chapter <em>One</em></h2><h3>Intro</h3>");
        expect(demoteHeadings(`<h1 id="top">Main</h1><h2>Sub</h2>`, "Title", verbatim))
            .toBe(`<h2 id="top">Main</h2><h3>Sub</h3>`);
    });

    it("applies the injected decoder to the demoted <h1> text and the title comparison only", () => {
        const upper = (s: string) => s.toUpperCase();
        // The decoder runs on the <h1> text but not on shifted sub-headings.
        expect(demoteHeadings("<h1>a</h1><h2>b</h2>", "Title", upper)).toBe("<h2>A</h2><h3>b</h3>");
        // The decoder is also used when comparing the first <h1> against the title.
        expect(demoteHeadings("<h1>a</h1>", "A", upper)).toBe("");
    });
});
