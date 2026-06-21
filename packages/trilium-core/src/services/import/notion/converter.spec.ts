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
