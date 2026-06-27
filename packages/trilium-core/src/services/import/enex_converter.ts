/**
 * Post-processes an Evernote note's ENML body into Trilium/CKEditor-friendly markup.
 *
 * Evernote marks its richer blocks with CSS custom properties on a `style` attribute (`--en-codeblock`,
 * `--en-callout`, `--en-todo`, …) rather than dedicated tags. Those markers are meaningless to CKEditor —
 * and the sanitizer strips the custom properties anyway — so this module must run *before* sanitization,
 * reading each marker and rewriting the block into the shape CKEditor expects (the same target shapes the
 * Notion and Anytype importers produce).
 *
 * Each feature is a small, independently-tested transform; {@link convertEnexContent} chains them. The
 * container transforms (callouts, toggles) run first: they re-emit their inner HTML, so any `--en-*` blocks
 * nested inside are picked up by the later passes (every pass re-queries the whole tree).
 */

import { getMimeTypeFromMarkdownName, MIME_TYPE_AUTO, normalizeMimeTypeForCKEditor } from "@triliumnext/commons";
import { HTMLElement, parse } from "node-html-parser";

import { escapeHtml } from "../utils/index.js";

export interface EnexTask {
    title: string;
    /** Evernote task status; `"completed"` maps to a checked to-do, anything else (e.g. `"open"`) to unchecked. */
    status?: string;
    /** The task group (`taskGroupNoteLevelID`) this task belongs to, matched against a placeholder's `--en-id`. */
    groupId?: string;
}

export function convertEnexContent(html: string, tasks: EnexTask[] = []): string {
    const root = parse(html);
    convertTaskGroups(root, tasks);
    convertCallouts(root);
    convertToggles(root);
    convertTodoLists(root);
    convertCodeBlocks(root);
    convertFormulaBlocks(root);
    convertMermaidBlocks(root);
    return root.toString();
}

// #region Internal note links
/** Prefix shared by Evernote internal-note link schemes: `evernote://view-note/<guid>` and `evernote:///view/.../<guid>/...`. */
const EVERNOTE_LINK_SCHEME = "evernote:";

/**
 * Rewrites Evernote internal note links into Trilium internal links. An ENEX export never carries a note's
 * own guid, so the `evernote://view-note/<guid>` target can't be matched by id; instead Evernote renders an
 * inline-richlink with the *target note's title* as its text, so the link is resolved by that text. A match
 * becomes a Trilium reference link (`#root/<noteId>`, the live-title chip); an unresolved internal link and
 * every external link are left untouched. Meant to run as a second pass, once every imported note's title is
 * known (a note can link to one imported later).
 */
export function rewriteEvernoteLinks(html: string, resolve: (linkText: string) => string | null): string {
    const root = parse(html);
    let changed = false;

    for (const anchor of root.querySelectorAll("a")) {
        if (!(anchor.getAttribute("href") ?? "").startsWith(EVERNOTE_LINK_SCHEME)) {
            continue;
        }
        const noteId = resolve(anchor.textContent.trim());
        if (!noteId) {
            continue;
        }
        anchor.setAttribute("href", `#root/${noteId}`);
        anchor.setAttribute("class", "reference-link");
        changed = true;
    }

    return changed ? root.toString() : html;
}
// #endregion

// #region Tasks
/**
 * Evernote's newer Tasks feature exports each task group as a "Content not supported" placeholder div
 * (`--en-task-group:true; --en-id:<groupId>`), while the tasks themselves are `<task>` elements at the
 * note level. Replace each placeholder with a CKEditor to-do list of the tasks whose `taskGroupNoteLevelID`
 * matches the placeholder's `--en-id` (a completed task becomes a checked item). A placeholder with no
 * matching tasks is simply removed, so the unsupported-block notice never reaches the imported note.
 */
function convertTaskGroups(root: HTMLElement, tasks: EnexTask[]) {
    const placeholders = root.querySelectorAll("div").filter((div) => hasEnFlag(div, "--en-task-group"));
    const used = new Set<number>();

    for (const placeholder of placeholders) {
        const groupId = parseEnVar(placeholder, "--en-id");
        const items = tasks
            .map((task, index) => ({ task, index }))
            .filter(({ task, index }) => !used.has(index) && (groupId ? task.groupId === groupId : true));

        for (const { index } of items) {
            used.add(index);
        }
        if (items.length > 0) {
            const list = renderTodoList(items.map(({ task }) => renderTodoItem(task.status === "completed", escapeHtml((task.title ?? "").trim()))));
            placeholder.insertAdjacentHTML("beforebegin", list);
        }
        placeholder.remove();
    }
}
// #endregion

// #region Admonitions (callouts)
/** Evernote's default callout icon; it maps 1:1 to a "tip" admonition, so the emoji itself is redundant. */
const DEFAULT_CALLOUT_EMOJI = "💡";

/**
 * Evernote callouts are `<div style="--en-callout:true; --en-emoji:<emoji>">` wrapping the body. Trilium
 * has admonitions, so rewrite each into `<aside class="admonition <type>">` (mirroring the Notion importer):
 * the default light-bulb maps to a "tip" with the icon dropped (it's implied); any other emoji maps to a
 * neutral "note" with the emoji injected at the start of the content so the information isn't lost. Runs in
 * reverse document order so a nested callout is converted before the callout that contains it.
 */
function convertCallouts(root: HTMLElement) {
    for (const div of root.querySelectorAll("div").filter((node) => hasEnFlag(node, "--en-callout")).reverse()) {
        const emoji = parseEnVar(div, "--en-emoji");
        const type = emoji === DEFAULT_CALLOUT_EMOJI ? "tip" : "note";
        if (type === "note" && emoji) {
            prependCalloutEmoji(div, emoji);
        }
        div.insertAdjacentHTML("beforebegin", `<aside class="admonition ${type}">${div.innerHTML}</aside>`);
        div.remove();
    }
}

/** Injects the callout's emoji into its first block child (so it shares the first line), else as leading text. */
function prependCalloutEmoji(div: HTMLElement, emoji: string) {
    const firstEl = div.childNodes.find((node): node is HTMLElement => node instanceof HTMLElement);
    if (firstEl && (isTag(firstEl, "div") || isTag(firstEl, "p"))) {
        firstEl.set_content(`${emoji} ${firstEl.innerHTML}`);
    } else {
        div.insertAdjacentHTML("afterbegin", `${emoji} `);
    }
}
// #endregion

// #region Toggles
/**
 * Evernote toggles are `<div style="--en-toggle:true; --en-isCollapsed:<bool>">` holding a
 * `--en-toggleSummary` div and a `--en-toggleContent` div. Trilium's collapsible block is a bare
 * `<details class="trilium-collapsible">`, so rewrite each toggle into one: the summary becomes the
 * `<summary>`, the content's (non-empty) blocks become the body, and an expanded toggle keeps an `open`
 * attribute so the published/share view reflects its state. Runs in reverse document order so a nested
 * toggle is converted before the toggle that contains it.
 */
function convertToggles(root: HTMLElement) {
    for (const div of root.querySelectorAll("div").filter((node) => hasEnFlag(node, "--en-toggle")).reverse()) {
        const summaryDiv = div.childNodes.find((node): node is HTMLElement => node instanceof HTMLElement && hasEnFlag(node, "--en-toggleSummary"));
        const contentDiv = div.childNodes.find((node): node is HTMLElement => node instanceof HTMLElement && hasEnFlag(node, "--en-toggleContent"));

        const summary = summaryDiv ? summaryDiv.innerHTML.trim() : "";
        const body = contentDiv ? toggleBody(contentDiv) : "";
        const open = parseEnVar(div, "--en-isCollapsed") === "true" ? "" : " open";
        div.insertAdjacentHTML("beforebegin", `<details class="trilium-collapsible"${open}><summary>${summary}</summary>${body}</details>`);
        div.remove();
    }
}

/** The toggle's body: its content blocks minus the empty spacer divs Evernote pads collapsible content with. */
function toggleBody(contentDiv: HTMLElement): string {
    return contentDiv.childNodes.filter((node) => isNonEmptyBlock(node)).map((node) => node.toString()).join("");
}

/** True for a node carrying real content — text, or an embedded image/media — i.e. not an empty spacer block. */
function isNonEmptyBlock(node: HTMLElement["childNodes"][number]): boolean {
    if (!(node instanceof HTMLElement)) {
        return (node.textContent ?? "").trim() !== "";
    }
    return (node.textContent ?? "").trim() !== "" || node.querySelectorAll("img, en-media").length > 0;
}
// #endregion

// #region Checkboxes (to-do lists)
/**
 * Evernote checkbox lists are `<ul style="--en-todo:true;">` whose `<li style="--en-checked:<bool>">` items
 * hold the label, and whose sub-lists are emitted as a *sibling* `--en-todo` `<ul>` following the parent
 * item (not nested inside it). Rewrite each top-level checkbox list into CKEditor's `<ul class="todo-list">`,
 * folding each sibling sub-list into the preceding item's `<li>` (the nesting CKEditor expects). Nested lists
 * are handled by recursion; the outer pass skips any `--en-todo` list whose parent is itself one.
 */
function convertTodoLists(root: HTMLElement) {
    const topLevel = root.querySelectorAll("ul").filter((ul) => isEnTodoUl(ul) && !isEnTodoUl(ul.parentNode));
    for (const ul of topLevel) {
        ul.insertAdjacentHTML("beforebegin", buildTodoList(ul));
        ul.remove();
    }
}

function buildTodoList(ul: HTMLElement): string {
    const items: { checked: boolean; description: string; nested: string }[] = [];

    for (const child of ul.childNodes) {
        if (!(child instanceof HTMLElement)) {
            continue;
        }
        if (isTag(child, "li")) {
            items.push({ checked: parseEnVar(child, "--en-checked") === "true", description: itemDescription(child), nested: "" });
        } else if (isEnTodoUl(child)) {
            // A sibling sub-list belongs to the item it follows; recurse and nest it there.
            const nested = buildTodoList(child);
            const parent = items[items.length - 1];
            if (parent) {
                parent.nested += nested;
            } else {
                items.push({ checked: false, description: "", nested });
            }
        }
    }

    return renderTodoList(items.map((item) => renderTodoItem(item.checked, item.description, item.nested)));
}

/** An item's label: the inner HTML of its sole `<div>` wrapper (Evernote wraps each line), else its content. */
function itemDescription(li: HTMLElement): string {
    const elements = li.childNodes.filter((node): node is HTMLElement => node instanceof HTMLElement && !isEnTodoUl(node));
    if (elements.length === 1 && isTag(elements[0], "div")) {
        return elements[0].innerHTML.trim();
    }
    return li.childNodes.filter((node) => !(node instanceof HTMLElement && isEnTodoUl(node))).map((node) => node.toString()).join("").trim();
}

function isEnTodoUl(node: HTMLElement["childNodes"][number] | null): node is HTMLElement {
    return node instanceof HTMLElement && isTag(node, "ul") && hasEnFlag(node, "--en-todo");
}
// #endregion

// #region Code, formula and mermaid blocks
/**
 * Evernote code blocks are `<div style="--en-codeblock:true; --en-syntaxLanguage:<lang>">` whose inner
 * `<div>`s are the lines. Rewrite each into Trilium's canonical `<pre><code class="language-<mime>">`,
 * mapping the syntax language to its CKEditor mime class (falling back to auto-detect when unknown).
 */
function convertCodeBlocks(root: HTMLElement) {
    for (const div of root.querySelectorAll("div").filter((node) => hasEnFlag(node, "--en-codeblock"))) {
        const language = resolveCodeLanguage(parseEnVar(div, "--en-syntaxLanguage"));
        div.insertAdjacentHTML("beforebegin", `<pre><code class="language-${language}">${escapeCode(blockText(div))}</code></pre>`);
        div.remove();
    }
}

/**
 * Evernote mermaid blocks are `<div style="--en-mermaidblock:true;">` whose inner `<div>`s are the diagram
 * lines. Emit a `language-mermaid` code block — Trilium's mermaid rendering keys off that class, the same
 * convention the Notion and Anytype importers use.
 */
function convertMermaidBlocks(root: HTMLElement) {
    for (const div of root.querySelectorAll("div").filter((node) => hasEnFlag(node, "--en-mermaidblock"))) {
        div.insertAdjacentHTML("beforebegin", `<pre><code class="language-mermaid">${escapeCode(blockText(div))}</code></pre>`);
        div.remove();
    }
}

/**
 * Evernote formula blocks are `<div style="--en-formulablock:true;">` holding the LaTeX. Emit CKEditor's
 * display-math span (`<span class="math-tex">\[ … \]</span>`); an empty formula block is dropped.
 */
function convertFormulaBlocks(root: HTMLElement) {
    for (const div of root.querySelectorAll("div").filter((node) => hasEnFlag(node, "--en-formulablock"))) {
        const formula = blockText(div).trim();
        if (formula) {
            div.insertAdjacentHTML("beforebegin", `<span class="math-tex">\\[${escapeHtml(formula)}\\]</span>`);
        }
        div.remove();
    }
}

/** Joins a block's inner `<div>` lines with newlines (an empty/`<br>`-only div is a blank line). */
function blockText(container: HTMLElement): string {
    const lines = container.childNodes.filter((node): node is HTMLElement => node instanceof HTMLElement && isTag(node, "div"));
    if (lines.length > 0) {
        return lines.map((line) => lineText(line)).join("\n");
    }
    return container.textContent ?? "";
}

/** A single line's text. node-html-parser renders `<br>` as a newline, so a lone-`<br>` line (Evernote's blank line) reads as empty. */
function lineText(line: HTMLElement): string {
    const text = line.textContent ?? "";
    if (text.trim() === "" && line.querySelectorAll("br").length > 0) {
        return "";
    }
    return text;
}

/** Escapes code/diagram text for HTML, but keeps literal double quotes (CKEditor stores them unescaped). */
function escapeCode(text: string): string {
    return escapeHtml(text).replace(/&quot;/g, '"');
}

/** Resolves an Evernote syntax-language id to the class Trilium expects on a code block. */
function resolveCodeLanguage(language: string | undefined): string {
    if (!language) {
        return MIME_TYPE_AUTO;
    }
    if (language === "mermaid") {
        return "mermaid";
    }
    const mime = getMimeTypeFromMarkdownName(language);
    return mime ? normalizeMimeTypeForCKEditor(mime.mime) : MIME_TYPE_AUTO;
}
// #endregion

// #region Shared helpers
/** Renders a CKEditor to-do item; `checked` before `disabled` matches what the editor re-emits on save. */
function renderTodoItem(checked: boolean, description: string, nested = ""): string {
    const attributes = checked ? ` checked="checked" disabled="disabled"` : ` disabled="disabled"`;
    return `<li><label class="todo-list__label"><input type="checkbox"${attributes}><span class="todo-list__label__description">${description}</span></label>${nested}</li>`;
}

function renderTodoList(items: string[]): string {
    return `<ul class="todo-list">${items.join("")}</ul>`;
}

/** True when the element's inline style declares the given Evernote marker property (`--en-name:`). */
function hasEnFlag(node: HTMLElement, name: string): boolean {
    return new RegExp(`${name}\\s*:`).test(node.getAttribute("style") ?? "");
}

/** Reads an Evernote marker property's value from the element's inline style, or undefined when absent. */
function parseEnVar(node: HTMLElement, name: string): string | undefined {
    return (node.getAttribute("style") ?? "").match(new RegExp(`${name}\\s*:\\s*([^;]+)`))?.[1]?.trim();
}

function isTag(node: HTMLElement, tag: string): boolean {
    return node.tagName?.toLowerCase() === tag;
}
// #endregion
