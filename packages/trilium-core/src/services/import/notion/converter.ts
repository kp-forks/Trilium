/**
 * Post-processes a Notion page's body HTML into Trilium/CKEditor-friendly markup.
 *
 * Notion's export HTML carries its own block conventions (to-do lists, callouts, toggles, …) that don't
 * match what CKEditor expects. This module applies a pipeline of transforms to bridge the two. It runs
 * before sanitization, so it may emit any markup the sanitizer subsequently allows.
 *
 * Each feature is a small, independently-tested transform; {@link convertNotionHtml} chains them.
 */

import { type HTMLElement, parse } from "node-html-parser";

export function convertNotionHtml(html: string): string {
    const root = parse(html);
    convertTodoLists(root);
    return root.toString();
}

/**
 * Notion renders each to-do item as its own `<ul class="to-do-list">` whose `<li>` holds a
 * `<div class="checkbox checkbox-on|off">`, a `<span class="to-do-children-...">` with the label, and an
 * empty `<div class="indented">`. Rewrite each into CKEditor's todo-list shape, mapping checkbox-on to a
 * checked input. (Nested sub-items in `.indented` are not handled yet.)
 */
function convertTodoLists(root: HTMLElement) {
    for (const ul of root.querySelectorAll("ul.to-do-list")) {
        const items = ul.querySelectorAll("li")
            .filter((li) => li.parentNode === ul)
            .map((li) => buildTodoItem(li));
        ul.setAttribute("class", "todo-list");
        ul.set_content(items.join(""));
    }
}

function buildTodoItem(li: HTMLElement): string {
    const checked = li.querySelector(".checkbox")?.classList.contains("checkbox-on") ?? false;
    const label = li.querySelectorAll("span").find((span) =>
        span.classList.contains("to-do-children-checked") || span.classList.contains("to-do-children-unchecked"));
    const description = label?.innerHTML ?? "";
    // Match the canonical CKEditor data serialization (checked before disabled) so a freshly imported
    // note already equals what the editor would re-emit on its first save.
    const attributes = checked ? ` checked="checked" disabled="disabled"` : ` disabled="disabled"`;
    return `<li><label class="todo-list__label"><input type="checkbox"${attributes}><span class="todo-list__label__description">${description}</span></label></li>`;
}
