import { describe, expect, it } from "vitest";

import { convertNotionHtml } from "./converter.js";

describe("convertNotionHtml — to-do lists", () => {
    it("converts an unchecked Notion to-do item to a CKEditor todo-list", () => {
        const input = `<ul class="to-do-list"><li><div class="checkbox checkbox-off"></div> <span class="to-do-children-unchecked">To do</span><div class="indented"></div></li></ul>`;
        expect(convertNotionHtml(input)).toBe(
            `<ul class="todo-list"><li><label class="todo-list__label"><input type="checkbox" disabled="disabled"><span class="todo-list__label__description">To do</span></label></li></ul>`
        );
    });

    it("marks a checked item with checked=\"checked\"", () => {
        const input = `<ul class="to-do-list"><li><div class="checkbox checkbox-on"></div> <span class="to-do-children-checked">Done</span><div class="indented"></div></li></ul>`;
        expect(convertNotionHtml(input)).toBe(
            `<ul class="todo-list"><li><label class="todo-list__label"><input type="checkbox" checked="checked" disabled="disabled"><span class="todo-list__label__description">Done</span></label></li></ul>`
        );
    });

    it("preserves inline formatting inside the item text", () => {
        const input = `<ul class="to-do-list"><li><div class="checkbox checkbox-off"></div> <span class="to-do-children-unchecked">Buy <strong>milk</strong></span><div class="indented"></div></li></ul>`;
        expect(convertNotionHtml(input)).toContain(`<span class="todo-list__label__description">Buy <strong>milk</strong></span>`);
    });

    it("leaves non-to-do HTML untouched", () => {
        const input = `<p id="x">Hello</p>`;
        expect(convertNotionHtml(input)).toBe(`<p id="x">Hello</p>`);
    });
});

describe("convertNotionHtml — to-do nesting and merging", () => {
    // Each Notion to-do item is its own <ul class="to-do-list"> wrapped in a display:contents <div>;
    // a parent's children live in its <div class="indented">, each again its own wrapped single-item list.
    const wrap = (ulInner: string) => `<div style="display:contents" dir="auto"><ul class="to-do-list"><li>${ulInner}</li></ul></div>`;
    const off = (text: string, indented = "") => `<div class="checkbox checkbox-off"></div> <span class="to-do-children-unchecked">${text}</span><div class="indented">${indented}</div>`;
    const on = (text: string, indented = "") => `<div class="checkbox checkbox-on"></div> <span class="to-do-children-checked">${text}</span><div class="indented">${indented}</div>`;

    const item = (text: string, opts: { checked?: boolean; nested?: string } = {}) =>
        `<li><label class="todo-list__label"><input type="checkbox"${opts.checked ? ` checked="checked"` : ""} disabled="disabled"><span class="todo-list__label__description">${text}</span></label>${opts.nested ?? ""}</li>`;
    const list = (...items: string[]) => `<ul class="todo-list">${items.join("")}</ul>`;

    it("nests a parent's sub-items into a single nested todo-list inside its <li>", () => {
        const input = wrap(off("Parent", wrap(off("Child 1")) + wrap(on("Child 2"))));
        expect(convertNotionHtml(input)).toBe(
            list(item("Parent", { nested: list(item("Child 1"), item("Child 2", { checked: true })) }))
        );
    });

    it("merges adjacent top-level to-do items into one list", () => {
        const input = wrap(off("A")) + wrap(on("B"));
        expect(convertNotionHtml(input)).toBe(list(item("A"), item("B", { checked: true })));
    });

    it("does not merge to-do items separated by other content", () => {
        const input = `${wrap(off("A"))}<p>Sep</p>${wrap(off("B"))}`;
        expect(convertNotionHtml(input)).toBe(`${list(item("A"))}<p>Sep</p>${list(item("B"))}`);
    });

    it("converts to-do lists nested inside other blocks (e.g. a toggle's <details>)", () => {
        const toggle = (summary: string, body: string) => `<ul class="toggle"><li><details open=""><summary>${summary}</summary>${body}</details></li></ul>`;
        const input = toggle("The quick brownie", wrap(off("The quick brown", wrap(off("fox jumps")))));
        expect(convertNotionHtml(input)).toBe(
            `<details open class="trilium-collapsible"><summary>The quick brownie</summary>${list(item("The quick brown", { nested: list(item("fox jumps")) }))}</details>`
        );
    });
});

describe("convertNotionHtml — display:contents wrappers", () => {
    it("unwraps the display:contents div Notion puts around each block", () => {
        expect(convertNotionHtml(`<div style="display:contents" dir="auto"><p id="x">A</p></div>`)).toBe(`<p id="x">A</p>`);
    });

    it("unwraps several wrapped blocks", () => {
        const input = `<div style="display:contents" dir="auto"><h1>A</h1></div><div style="display:contents" dir="auto"><p>B</p></div>`;
        expect(convertNotionHtml(input)).toBe(`<h1>A</h1><p>B</p>`);
    });

    it("flattens nested display:contents wrappers", () => {
        const input = `<div style="display:contents"><div style="display:contents"><p>A</p></div></div>`;
        expect(convertNotionHtml(input)).toBe(`<p>A</p>`);
    });

    it("leaves meaningful (non display:contents) divs intact", () => {
        const input = `<section><div style="font-size:1.5em"><span class="icon">x</span></div><div style="width:100%">body</div></section>`;
        expect(convertNotionHtml(input)).toBe(input);
    });
});

describe("convertNotionHtml — toggles", () => {
    it("unwraps a Notion toggle into a bare collapsible <details>, preserving its open state", () => {
        const input = `<div style="display:contents" dir="auto"><ul class="toggle"><li><details open=""><summary>Toggle title</summary><div style="display:contents" dir="auto"><p>Content goes here.</p></div><div style="display:contents" dir="auto"><p>And here.</p></div></details></li></ul></div>`;
        expect(convertNotionHtml(input)).toBe(
            `<details open class="trilium-collapsible"><summary>Toggle title</summary><p>Content goes here.</p><p>And here.</p></details>`
        );
    });

    it("preserves a collapsed toggle's state (no open attribute)", () => {
        expect(convertNotionHtml(`<ul class="toggle"><li><details><summary>Closed</summary></details></li></ul>`)).toBe(
            `<details class="trilium-collapsible"><summary>Closed</summary></details>`
        );
    });

    it("handles a toggle with no body and an empty summary", () => {
        expect(convertNotionHtml(`<ul class="toggle"><li><details open=""><summary>Title only</summary></details></li></ul>`)).toBe(
            `<details open class="trilium-collapsible"><summary>Title only</summary></details>`
        );
        expect(convertNotionHtml(`<ul class="toggle"><li><details open=""><summary></summary></details></li></ul>`)).toBe(
            `<details open class="trilium-collapsible"><summary></summary></details>`
        );
    });

    it("keeps a nested toggle nested rather than flattening it", () => {
        const input = `<ul class="toggle"><li><details open=""><summary>Outer</summary><div style="display:contents"><ul class="toggle"><li><details open=""><summary>Inner</summary></details></li></ul></div></details></li></ul>`;
        expect(convertNotionHtml(input)).toBe(
            `<details open class="trilium-collapsible"><summary>Outer</summary><details open class="trilium-collapsible"><summary>Inner</summary></details></details>`
        );
    });
});

describe("convertNotionHtml — callouts", () => {
    const callout = (emoji: string, body: string) =>
        `<div style="display:contents" dir="ltr"><figure class="block-color-gray_background callout" style="white-space:pre-wrap;display:flex" id="386c5eca"><div style="font-size:1.5em"><span class="icon">${emoji}</span></div><div style="width:100%"><div style="display:contents" dir="auto">${body}</div></div></figure></div>`;

    it("maps the default light-bulb callout to a tip admonition, dropping the redundant icon", () => {
        expect(convertNotionHtml(callout("💡", `<p>Callout with default icon.</p>`))).toBe(
            `<aside class="admonition tip"><p>Callout with default icon.</p></aside>`
        );
    });

    it("maps a non-default emoji callout to a note admonition, preserving the emoji in the content", () => {
        expect(convertNotionHtml(callout("♻️", `<p>Callout with custom emoji.</p>`))).toBe(
            `<aside class="admonition note"><p>♻️ Callout with custom emoji.</p></aside>`
        );
    });

    it("preserves a non-default emoji as a leading paragraph when the content doesn't start with one", () => {
        expect(convertNotionHtml(callout("♻️", `<h2>Heading body</h2>`))).toBe(
            `<aside class="admonition note"><p>♻️</p><h2>Heading body</h2></aside>`
        );
    });
});

describe("convertNotionHtml — math", () => {
    it("converts an inline Notion equation to a Trilium math-tex span and drops the katex style import", () => {
        const input = `<p><style>@import url('https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex-swap.min.css')</style><span data-token-index="0" contenteditable="false" class="notion-text-equation-token" style="user-select:all"><span></span><span><span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mi>e</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">e=mc^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">e=mc2</span></span></span></span></p>`;
        expect(convertNotionHtml(input)).toBe(`<p><span class="math-tex">\\(e=mc^2\\)</span></p>`);
    });

    it("removes a stray katex style block on its own", () => {
        expect(convertNotionHtml(`<p>Text<style>@import url('x')</style></p>`)).toBe(`<p>Text</p>`);
    });
});

describe("convertNotionHtml — bookmarks", () => {
    it("converts a Notion bookmark card to a Trilium link-embed, keeping the favicon", () => {
        const input = `<div style="display:contents" dir="ltr"><figure id="386c5eca"><a href="https://triliumnotes.org/" class="bookmark source"><div class="bookmark-info"><div class="bookmark-text"><div class="bookmark-title">Trilium Notes</div><div class="bookmark-description">Trilium is an open-source solution for note-taking and personal knowledge bases. Use it locally or sync with your own server to access notes anywhere.</div></div><div class="bookmark-href"><img src="https://triliumnotes.org/assets/favicon-BI5VJBD3.ico" class="icon bookmark-icon"/>https://triliumnotes.org/</div></div></a></figure></div>`;
        expect(convertNotionHtml(input)).toBe(
            `<section class="link-embed" data-url="https://triliumnotes.org/" data-embed-type="opengraph" data-title="Trilium Notes" data-description="Trilium is an open-source solution for note-taking and personal knowledge bases. Use it locally or sync with your own server to access notes anywhere." data-favicon="https://triliumnotes.org/assets/favicon-BI5VJBD3.ico"></section>`
        );
    });

    it("omits optional attributes that the bookmark doesn't provide", () => {
        const input = `<figure><a href="https://example.com/" class="bookmark source"><div class="bookmark-info"><div class="bookmark-text"><div class="bookmark-title">Example</div></div></div></a></figure>`;
        expect(convertNotionHtml(input)).toBe(
            `<section class="link-embed" data-url="https://example.com/" data-embed-type="opengraph" data-title="Example"></section>`
        );
    });
});

describe("convertNotionHtml — date mentions", () => {
    it("strips the @ prefix Notion puts on inline <time> date mentions", () => {
        expect(convertNotionHtml(`<p><time>@June 21, 2026</time></p>`)).toBe(`<p><time>June 21, 2026</time></p>`);
    });

    it("leaves date text without an @ untouched", () => {
        expect(convertNotionHtml(`<p><time>June 21, 2026</time></p>`)).toBe(`<p><time>June 21, 2026</time></p>`);
    });
});
