import { describe, expect, it } from "vitest";

import { isPage, parseObject } from "./importer.js";
import type { AnytypeBlock, AnytypeSnapshot } from "./model.js";

/** Wraps blocks + details into the export's snapshot shape. */
function snapshot(blocks: AnytypeBlock[], details: { id?: string; name?: string; layout?: number; resolvedLayout?: number }, sbType = "Page"): AnytypeSnapshot {
    return { sbType, snapshot: { data: { blocks, details } } };
}

/** A text block with the given style (defaults to Paragraph) and optional children. */
function textBlock(id: string, text: string, style = "Paragraph", childrenIds: string[] = []): AnytypeBlock {
    return { id, text: { text, style }, childrenIds };
}

/** A typical page: a root block pointing at the header chrome plus the given content block ids. */
function page(name: string, contentBlocks: AnytypeBlock[], layout = 0): AnytypeSnapshot {
    return snapshot(
        [
            { id: "obj", childrenIds: ["header", ...contentBlocks.map((b) => b.id)] },
            { id: "header", childrenIds: ["title"] },
            textBlock("title", "", "Title"),
            ...contentBlocks
        ],
        { id: "obj", name, layout }
    );
}

describe("isPage", () => {
    it("accepts a basic-layout Page and rejects sets and system objects", () => {
        expect(isPage(page("A page", []))).toBe(true);
        // A set/collection is also sbType Page but layout 3.
        expect(isPage(page("A set", [], 3))).toBe(false);
        // Non-page smartblocks (participant, workspace, …) are excluded regardless of layout.
        expect(isPage(snapshot([], { id: "p", name: "Someone", layout: 19 }, "Participant"))).toBe(false);
        expect(isPage(snapshot([], { id: "w", layout: 10 }, "Workspace"))).toBe(false);
    });

    it("accepts a basic page that omits `layout` (single-object exports), falling back to resolvedLayout", () => {
        // Anytype drops `layout` when it's the default, carrying the value in resolvedLayout instead.
        expect(isPage(snapshot([], { id: "p", name: "Solo page", resolvedLayout: 0 }))).toBe(true);
        // With neither field present, a Page still defaults to basic.
        expect(isPage(snapshot([], { id: "p", name: "Bare page" }))).toBe(true);
        // resolvedLayout still excludes a set whose `layout` is likewise omitted.
        expect(isPage(snapshot([], { id: "s", name: "Solo set", resolvedLayout: 3 }))).toBe(false);
    });
});

describe("parseObject", () => {
    it("takes the title from details.name and emits each text block as a paragraph, ignoring style", () => {
        const result = parseObject(page("My Page", [textBlock("b1", "First"), textBlock("b2", "Second", "Header1")]));
        expect(result.id).toBe("obj");
        expect(result.title).toBe("My Page");
        // Header1 still becomes a plain <p> — no formatting in this version.
        expect(result.content).toBe("<p>First</p><p>Second</p>");
    });

    it("walks nested blocks in document order (parent text before its children)", () => {
        const result = parseObject(page("Nested", [textBlock("b1", "Parent", "Paragraph", ["c1"]), textBlock("c1", "Child")]));
        expect(result.content).toBe("<p>Parent</p><p>Child</p>");
    });

    it("skips the header subtree and empty / non-text blocks", () => {
        const result = parseObject(
            page("Mixed", [
                textBlock("b1", "   "), // whitespace only
                { id: "b2", childrenIds: [] }, // a non-text block (e.g. a link/divider) carries no text
                textBlock("b3", "Real content")
            ])
        );
        expect(result.content).toBe("<p>Real content</p>");
    });

    it("escapes HTML special characters in the text", () => {
        const result = parseObject(page("Escaping", [textBlock("b1", "a < b & c > d")]));
        expect(result.content).toBe("<p>a &lt; b &amp; c &gt; d</p>");
    });

    it("falls back to 'Untitled' when the page has no name", () => {
        expect(parseObject(page("", [textBlock("b1", "body")])).title).toBe("Untitled");
        expect(parseObject(page("   ", [])).title).toBe("Untitled");
    });
});
