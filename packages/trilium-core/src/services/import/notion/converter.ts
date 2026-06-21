/**
 * Post-processes a Notion page's body HTML into Trilium/CKEditor-friendly markup.
 *
 * Notion's export HTML carries its own block conventions (to-do lists, callouts, toggles, …) that don't
 * match what CKEditor expects. This module applies a pipeline of transforms to bridge the two. It runs
 * before sanitization, so it may emit any markup the sanitizer subsequently allows.
 *
 * Each feature is a small, independently-tested transform; {@link convertNotionHtml} chains them.
 */

import { HTMLElement, parse } from "node-html-parser";

export function convertNotionHtml(html: string): string {
    const root = parse(html);
    convertTodoLists(root);
    return root.toString();
}

/**
 * Notion renders every to-do item as its own `<ul class="to-do-list">` (each wrapped in a
 * `display:contents` `<div>`), whose `<li>` holds a `<div class="checkbox checkbox-on|off">`, a
 * `<span class="to-do-children-…">` label and a `<div class="indented">` carrying any sub-items.
 *
 * Rewrite each maximal run of adjacent to-do items within `container` into a single CKEditor
 * `<ul class="todo-list">`, mapping checkbox-on to a checked input. Sub-items are converted recursively
 * and emitted as a nested `<ul class="todo-list">` inside the parent `<li>`. Runs broken by other
 * content stay separate lists.
 */
function convertTodoLists(container: HTMLElement) {
    for (const run of collectTodoRuns(container)) {
        const items = run.flatMap(({ ul }) => directChildren(ul, "li").map((li) => buildTodoItem(li)));
        run[0].block.insertAdjacentHTML("beforebegin", `<ul class="todo-list">${items.join("")}</ul>`);
        for (const { block } of run) {
            block.remove();
        }
    }
}

interface TodoBlock {
    /** The container's direct child to replace — the wrapping `display:contents` div, or the `ul` itself. */
    block: HTMLElement;
    ul: HTMLElement;
}

/** Groups a container's direct children into maximal runs of adjacent to-do blocks (ignoring whitespace). */
function collectTodoRuns(container: HTMLElement): TodoBlock[][] {
    const runs: TodoBlock[][] = [];
    let current: TodoBlock[] | null = null;

    for (const node of container.childNodes) {
        if (node instanceof HTMLElement) {
            const ul = todoUl(node);
            if (ul) {
                if (!current) {
                    current = [];
                    runs.push(current);
                }
                current.push({ block: node, ul });
                continue;
            }
            current = null;
        } else if (node.toString().trim() !== "") {
            // A non-whitespace text/comment node breaks the run; whitespace between wrappers does not, so
            // that Notion's one-item-per-list wrappers still merge.
            current = null;
        }
    }

    return runs;
}

function buildTodoItem(li: HTMLElement): string {
    const checked = directChild(li, (n) => n.classList.contains("checkbox"))?.classList.contains("checkbox-on") ?? false;
    const label = directChild(li, (n) => isTag(n, "span")
        && (n.classList.contains("to-do-children-checked") || n.classList.contains("to-do-children-unchecked")));
    const description = label?.innerHTML ?? "";

    // A to-do item's sub-items live in its `.indented`; convert them in place and nest the result inside
    // this `<li>` (CKEditor's nested-list shape). Empty when there are none.
    const indented = directChild(li, (n) => n.classList.contains("indented"));
    let nested = "";
    if (indented) {
        convertTodoLists(indented);
        nested = indented.innerHTML.trim();
    }

    // Match the canonical CKEditor data serialization (checked before disabled) so a freshly imported
    // note already equals what the editor would re-emit on its first save.
    const attributes = checked ? ` checked="checked" disabled="disabled"` : ` disabled="disabled"`;
    return `<li><label class="todo-list__label"><input type="checkbox"${attributes}><span class="todo-list__label__description">${description}</span></label>${nested}</li>`;
}

/** Returns the to-do `<ul>` a container child represents — the node itself, or the one `display:contents` wraps. */
function todoUl(node: HTMLElement): HTMLElement | null {
    if (isTodoUl(node)) {
        return node;
    }
    if (isTag(node, "div") && (node.getAttribute("style") ?? "").replace(/\s/g, "").includes("display:contents")) {
        const elements = node.childNodes.filter((child): child is HTMLElement => child instanceof HTMLElement);
        if (elements.length === 1 && isTodoUl(elements[0])) {
            return elements[0];
        }
    }
    return null;
}

function isTodoUl(node: HTMLElement): boolean {
    return isTag(node, "ul") && node.classList.contains("to-do-list");
}

function isTag(node: HTMLElement, tag: string): boolean {
    return node.tagName?.toLowerCase() === tag;
}

function directChild(parent: HTMLElement, predicate: (node: HTMLElement) => boolean): HTMLElement | null {
    for (const node of parent.childNodes) {
        if (node instanceof HTMLElement && predicate(node)) {
            return node;
        }
    }
    return null;
}

function directChildren(parent: HTMLElement, tag: string): HTMLElement[] {
    return parent.childNodes.filter((node): node is HTMLElement => node instanceof HTMLElement && isTag(node, tag));
}
