import { describe, expect, it } from "vitest";

import { isPage, parseObject, renderCodeBlock, renderInlineText } from "./importer.js";
import type { AnytypeBlock, AnytypeMark, AnytypeSnapshot } from "./importer.js";

/** Wraps blocks + details into the export's snapshot shape. */
function snapshot(blocks: AnytypeBlock[], details: { id?: string; name?: string; layout?: number; resolvedLayout?: number }, sbType = "Page"): AnytypeSnapshot {
    return { sbType, snapshot: { data: { blocks, details } } };
}

/** A text block with the given style (defaults to Paragraph), optional children and optional marks. */
function textBlock(id: string, text: string, style = "Paragraph", childrenIds: string[] = [], marks: AnytypeMark[] = []): AnytypeBlock {
    return { id, text: { text, style, marks: { marks } }, childrenIds };
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

/** An inline mark over a `[from, to)` range. */
function mark(from: number, to: number, type: string, param?: string): AnytypeMark {
    return { range: { from, to }, type, param };
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
    it("takes the title from details.name and emits non-heading text blocks as paragraphs", () => {
        // Numbered/Marked/Quote etc. are all flattened to <p> for now (only headings get their own tag).
        const result = parseObject(page("My Page", [textBlock("b1", "First"), textBlock("b2", "Second", "Numbered")]));
        expect(result.id).toBe("obj");
        expect(result.title).toBe("My Page");
        expect(result.content).toBe("<p>First</p><p>Second</p>");
    });

    it("maps Anytype's three heading styles to Trilium's top heading levels (h2/h3/h4)", () => {
        // Labels and order taken from the "Formatting test" page: Header1/2/3 are Title/Heading/Subheading.
        const result = parseObject(
            page("Headings", [
                textBlock("b1", "Regular text", "Paragraph"),
                textBlock("b2", "Title", "Header1"),
                textBlock("b3", "Heading", "Header2"),
                textBlock("b4", "Subheading", "Header3")
            ])
        );
        expect(result.content).toBe("<p>Regular text</p><h2>Title</h2><h3>Heading</h3><h4>Subheading</h4>");
    });

    it("applies inline marks inside the block's tag", () => {
        const result = parseObject(page("Marks", [textBlock("b1", "Bold text", "Paragraph", [], [mark(0, 4, "Bold")])]));
        expect(result.content).toBe("<p><strong>Bold</strong> text</p>");
    });

    it("renders a Code-style block as a code block, preserving the language from fields.lang", () => {
        const codeBlock: AnytypeBlock = { id: "b1", text: { text: "int x;", style: "Code" }, fields: { lang: "clike" }, childrenIds: [] };
        const result = parseObject(page("Code", [codeBlock]));
        expect(result.content).toBe('<pre><code class="language-text-x-csrc">int x;</code></pre>');
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

    it("falls back to 'Untitled' when the page has no name", () => {
        expect(parseObject(page("", [textBlock("b1", "body")])).title).toBe("Untitled");
        expect(parseObject(page("   ", [])).title).toBe("Untitled");
    });
});

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

    it("maps TextColor to a colour span and a BackgroundColor highlight to a colour + background span", () => {
        expect(renderInlineText("Red", [mark(0, 3, "TextColor", "red")])).toBe('<span style="color:#e2400c">Red</span>');
        // A highlight with no explicit text colour gets Anytype's default dark text (#252525) so it stays
        // readable on dark themes — otherwise the theme-default white text is invisible on the pale highlight.
        expect(renderInlineText("Red", [mark(0, 3, "BackgroundColor", "red")])).toBe(
            '<span style="color:#252525;background-color:#fcd1c3">Red</span>'
        );
    });

    it("combines co-occurring text + background colour into one span, nested inside structural marks", () => {
        // An explicit text colour wins over the highlight default, and both fold into a single span.
        expect(renderInlineText("Red", [mark(0, 3, "TextColor", "red"), mark(0, 3, "BackgroundColor", "red")])).toBe(
            '<span style="color:#e2400c;background-color:#fcd1c3">Red</span>'
        );
        // A structural mark stays outermost; the colour span nests inside it.
        expect(renderInlineText("Red", [mark(0, 3, "Bold"), mark(0, 3, "TextColor", "red")])).toBe(
            '<strong><span style="color:#e2400c">Red</span></strong>'
        );
    });

    it("colours each word independently across a palette line (as the page exports it)", () => {
        expect(renderInlineText("Grey Red", [mark(0, 4, "TextColor", "grey"), mark(5, 8, "TextColor", "red")])).toBe(
            '<span style="color:#8c9ea5">Grey</span> <span style="color:#e2400c">Red</span>'
        );
    });

    it("ignores an unknown colour name and genuinely unsupported mark types", () => {
        expect(renderInlineText("x", [mark(0, 1, "TextColor", "chartreuse")])).toBe("x");
        expect(renderInlineText("@bob", [mark(0, 4, "Mention", "someObjectId")])).toBe("@bob");
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

describe("renderCodeBlock", () => {
    it("wraps code in <pre><code> with the resolved language class", () => {
        // Anytype tags C-family code as PrismJS "clike"; Trilium has no such code, so it's aliased to C.
        expect(renderCodeBlock("int x;", "clike")).toBe('<pre><code class="language-text-x-csrc">int x;</code></pre>');
    });

    it("resolves a language code that matches a Trilium markdown name directly", () => {
        expect(renderCodeBlock("print(1)", "python")).toBe('<pre><code class="language-text-x-python">print(1)</code></pre>');
    });

    it("falls back to auto-detect for an unknown or missing language", () => {
        expect(renderCodeBlock("plain", "nonsense")).toBe('<pre><code class="language-text-x-trilium-auto">plain</code></pre>');
        expect(renderCodeBlock("plain", undefined)).toBe('<pre><code class="language-text-x-trilium-auto">plain</code></pre>');
    });

    it("escapes HTML and keeps quotes literal, preserving newlines and tabs", () => {
        expect(renderCodeBlock('a<b & c>\n\t"q"', "clike")).toBe('<pre><code class="language-text-x-csrc">a&lt;b &amp; c&gt;\n\t"q"</code></pre>');
    });
});
