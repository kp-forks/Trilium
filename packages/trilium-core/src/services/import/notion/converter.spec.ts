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

    it("leaves meaningful divs intact", () => {
        const input = `<figure class="callout"><div style="font-size:1.5em"><span class="icon">x</span></div><div style="width:100%">body</div></figure>`;
        expect(convertNotionHtml(input)).toBe(input);
    });
});
