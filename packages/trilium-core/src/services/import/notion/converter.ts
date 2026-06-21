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
    convertToggles(root);
    unwrapDisplayContents(root);
    convertCallouts(root);
    return root.toString();
}

/** Notion's default callout icon; it maps 1:1 to a "tip" admonition, so the emoji itself is redundant. */
const DEFAULT_CALLOUT_EMOJI = "💡";

/**
 * Notion callouts are `<figure class="callout">` with an icon div (`<span class="icon">…</span>`) and a
 * content div. Trilium has admonitions, so rewrite each into `<aside class="admonition <type>">`. The
 * default light-bulb maps to a "tip" (the icon is implied, so it's dropped); any other emoji maps to a
 * neutral "note" with the emoji preserved at the start of the content so the information isn't lost.
 *
 * Runs after wrapper-stripping so the content is already clean, and in reverse document order so a nested
 * callout is converted before the callout that contains it.
 */
function convertCallouts(root: HTMLElement) {
    for (const figure of [...root.querySelectorAll("figure.callout")].reverse()) {
        const divs = directChildren(figure, "div");
        const iconDiv = divs.find((div) => (div.getAttribute("style") ?? "").includes("font-size"));
        const contentDiv = divs.find((div) => (div.getAttribute("style") ?? "").replace(/\s/g, "").includes("width:100%")) ?? divs[divs.length - 1];

        const emoji = iconDiv?.querySelector("span.icon")?.textContent?.trim() ?? "";
        const type = emoji === DEFAULT_CALLOUT_EMOJI ? "tip" : "note";
        if (type === "note" && emoji && contentDiv) {
            prependEmoji(contentDiv, emoji);
        }

        figure.insertAdjacentHTML("beforebegin", `<aside class="admonition ${type}">${contentDiv?.innerHTML ?? ""}</aside>`);
        figure.remove();
    }
}

/** Prepends the callout's emoji to its content: into the first paragraph, or as a leading one otherwise. */
function prependEmoji(contentDiv: HTMLElement, emoji: string) {
    const first = directChild(contentDiv, () => true);
    if (first && isTag(first, "p")) {
        first.set_content(`${emoji} ${first.innerHTML}`);
    } else {
        contentDiv.insertAdjacentHTML("afterbegin", `<p>${emoji}</p>`);
    }
}

/**
 * Trilium has no list-based toggle; its collapsible block is a bare `<details>`
 * (data view `<details class="trilium-collapsible">`). Notion exports each toggle as
 * `<ul class="toggle"><li><details>…</details></li></ul>`, so drop the list wrapper, hoisting the
 * `<details>` in its place and tagging it with Trilium's collapsible class. Only the toggle's own
 * top-level `<details>` is hoisted; a nested toggle is handled when the loop reaches its own `ul.toggle`,
 * which keeps it nested. Notion's native `open` attribute is preserved so the published/share view
 * reflects the exported expanded/collapsed state (the in-app editor always loads toggles collapsed, and
 * the sanitizer is configured to keep `open` on `details`).
 */
function convertToggles(root: HTMLElement) {
    for (const ul of root.querySelectorAll("ul.toggle")) {
        const detailsList = directChildren(ul, "li").flatMap((li) => directChildren(li, "details"));
        for (const details of detailsList) {
            const existing = details.getAttribute("class");
            details.setAttribute("class", existing ? `${existing} trilium-collapsible` : "trilium-collapsible");
        }
        ul.replaceWith(...detailsList);
    }
}

/**
 * Notion wraps almost every block in a `<div style="display:contents">`, a layout no-op that survives
 * sanitization and would otherwise leave the imported note littered with meaningless block wrappers.
 * Hoist each such div's children in its place; nested wrappers flatten too (querySelectorAll visits the
 * outer first, and the inner stays a live, reparented node). Other divs (callouts, `.indented`, …) are
 * left untouched.
 */
function unwrapDisplayContents(root: HTMLElement) {
    for (const div of root.querySelectorAll("div")) {
        if (isDisplayContents(div)) {
            div.replaceWith(...div.childNodes);
        }
    }
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

    // To-do lists can also sit inside other blocks — a toggle's <details>, a callout, a list item, a
    // table cell — which the run pass above (limited to `container`'s direct children) doesn't reach.
    // Recurse into the remaining element children so those are converted in place too. The just-built
    // `todo-list`s are visited harmlessly: they hold no `to-do-list` markup for the run pass to match.
    for (const child of container.childNodes) {
        if (child instanceof HTMLElement) {
            convertTodoLists(child);
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
    if (isDisplayContents(node)) {
        const elements = node.childNodes.filter((child): child is HTMLElement => child instanceof HTMLElement);
        if (elements.length === 1 && isTodoUl(elements[0])) {
            return elements[0];
        }
    }
    return null;
}

function isDisplayContents(node: HTMLElement): boolean {
    return isTag(node, "div") && (node.getAttribute("style") ?? "").replace(/\s/g, "").includes("display:contents");
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
