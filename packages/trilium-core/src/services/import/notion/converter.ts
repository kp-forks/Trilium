/**
 * Post-processes a Notion page's body HTML into Trilium/CKEditor-friendly markup.
 *
 * Notion's export HTML carries its own block conventions (to-do lists, callouts, toggles, …) that don't
 * match what CKEditor expects. This module applies a pipeline of transforms to bridge the two. It runs
 * before sanitization, so it may emit any markup the sanitizer subsequently allows.
 *
 * Each feature is a small, independently-tested transform; {@link convertNotionHtml} chains them. The
 * transforms below are ordered to match that pipeline, each grouped in its own `#region`.
 */

import { getMimeTypeFromMarkdownName, MIME_TYPE_AUTO, normalizeMimeTypeForCKEditor } from "@triliumnext/commons";
import { HTMLElement, parse } from "node-html-parser";

export function convertNotionHtml(html: string): string {
    const root = parse(html);
    convertMath(root);
    stripDatePrefixes(root);
    convertTodoLists(root);
    convertToggles(root);
    unwrapDisplayContents(root);
    convertTables(root);
    convertImages(root);
    convertCodeBlocks(root);
    convertCallouts(root);
    convertBookmarks(root);
    convertLinkToPage(root);
    return root.toString();
}

// #region Math
/**
 * Notion renders each equation with KaTeX, preceded by a `<style>@import …katex…</style>` whose text
 * would otherwise survive sanitization as visible junk. Drop those style blocks and replace each inline
 * equation token (`span.notion-text-equation-token`) with Trilium's inline math span, recovering the
 * original LaTeX from the KaTeX `<annotation encoding="application/x-tex">`. (Block/display equations are
 * not in scope yet.)
 */
function convertMath(root: HTMLElement) {
    for (const style of root.querySelectorAll("style")) {
        style.remove();
    }

    for (const token of root.querySelectorAll("span.notion-text-equation-token")) {
        const annotations = token.querySelectorAll("annotation");
        const latex = (annotations.find((a) => a.getAttribute("encoding") === "application/x-tex") ?? annotations[0])?.textContent?.trim();
        if (!latex) {
            continue;
        }
        token.insertAdjacentHTML("beforebegin", `<span class="math-tex">\\(${latex}\\)</span>`);
        token.remove();
    }
}
// #endregion

// #region Date mentions
/**
 * Notion prefixes its inline date mentions with "@" (e.g. `<time>@June 21, 2026</time>`). Strip it so the
 * imported text reads naturally, mirroring how the importer already handles property-row date metadata.
 */
function stripDatePrefixes(root: HTMLElement) {
    for (const time of root.querySelectorAll("time")) {
        const text = time.textContent;
        if (text?.includes("@")) {
            time.set_content(text.replace(/@/g, ""));
        }
    }
}
// #endregion

// #region To-do lists
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

function isTodoUl(node: HTMLElement): boolean {
    return isTag(node, "ul") && node.classList.contains("to-do-list");
}
// #endregion

// #region Toggles
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
// #endregion

// #region display:contents wrappers
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
// #endregion

// #region Tables
/**
 * Notion tables are `<table class="simple-table">` with Notion-specific classes, ids and pixel widths on
 * every element, and the `<tr>`s wrapped in `display:contents` divs (already removed by the time this
 * runs). Rewrite each into Trilium's canonical form: strip the Notion attributes, mark header cells with
 * `scope` (col in the head, row in the body), and wrap the table in `<figure class="table">`.
 */
function convertTables(root: HTMLElement) {
    for (const table of root.querySelectorAll("table.simple-table")) {
        stripTableAttributes(table);
        for (const th of table.querySelectorAll("thead th")) {
            th.setAttribute("scope", "col");
        }
        for (const th of table.querySelectorAll("tbody th")) {
            th.setAttribute("scope", "row");
        }
        table.insertAdjacentHTML("beforebegin", `<figure class="table">${table.toString()}</figure>`);
        table.remove();
    }
}

/** Removes Notion's class/id/style from the table and every cell/row/section, keeping colspan/rowspan. */
function stripTableAttributes(table: HTMLElement) {
    const strip = (el: HTMLElement) => {
        el.removeAttribute("class");
        el.removeAttribute("id");
        el.removeAttribute("style");
    };
    strip(table);
    for (const tag of ["thead", "tbody", "tr", "th", "td"]) {
        for (const el of table.querySelectorAll(tag)) {
            strip(el);
        }
    }
}
// #endregion

// #region Images
/**
 * Notion image blocks are `<figure class="image"><a href="…"><img src="…"></a></figure>`, where the
 * `<a>` is a self-link to the file and the `<img>` carries an inline pixel width. Reduce each to Trilium's
 * canonical `<figure class="image"><img src="…"></figure>` (unwrap the link, drop the sizing and the
 * Notion id). The `src` still points at the zip-relative path; the importer rewrites it to an attachment.
 */
function convertImages(root: HTMLElement) {
    for (const figure of root.querySelectorAll("figure.image")) {
        const img = figure.querySelector("img");
        if (!img) {
            continue;
        }
        img.removeAttribute("style");
        figure.removeAttribute("id");
        figure.set_content(img.toString());
    }
}
// #endregion

// #region Code blocks
/**
 * Notion code blocks ship as `<pre class="code"><code class="language-<prism>">…</code></pre>`, preceded
 * by Prism `<script>`/`<link>` CDN includes. Drop the includes and reduce each block to Trilium's
 * canonical `<pre><code class="language-<mime>">`. The Prism language id is mapped to Trilium's
 * mime-based class via the shared dictionary; unknown or unlabelled languages fall back to auto-detection.
 */
function convertCodeBlocks(root: HTMLElement) {
    for (const tag of ["script", "link"]) {
        for (const el of root.querySelectorAll(tag)) {
            el.remove();
        }
    }

    for (const pre of root.querySelectorAll("pre")) {
        // node-html-parser treats a <pre>'s content as raw text, so re-parse it to reach the <code>.
        const inner = parse(pre.innerHTML);
        const code = inner.querySelector("code");
        if (!code) {
            continue;
        }
        const prismLanguage = (code.getAttribute("class") ?? "").match(/language-(\S+)/)?.[1];
        const mime = prismLanguage ? getMimeTypeFromMarkdownName(prismLanguage) : undefined;
        const language = mime ? normalizeMimeTypeForCKEditor(mime.mime) : MIME_TYPE_AUTO;

        code.removeAttribute("style");
        code.setAttribute("class", `language-${language}`);
        pre.removeAttribute("id");
        pre.removeAttribute("class");
        pre.set_content(inner.toString());
    }
}
// #endregion

// #region Callouts
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

/** Block-level tags a callout's content may open with; an emoji can't be merged inline into these. */
const CALLOUT_BLOCK_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "blockquote", "pre", "figure", "table", "aside", "details"]);

/**
 * Prepends the callout's emoji to its content. Notion's callout body is usually a run of inline content
 * (raw text, `<strong>`, `<br>`…) with no wrapping paragraph, so the emoji is merged inline so it shares
 * the first line. When the body instead opens with a paragraph the emoji goes inside it; when it opens
 * with another block element (e.g. a heading) the emoji becomes its own leading paragraph.
 */
function prependEmoji(contentDiv: HTMLElement, emoji: string) {
    const firstEl = contentDiv.childNodes[0] instanceof HTMLElement ? contentDiv.childNodes[0] : null;
    if (firstEl && isTag(firstEl, "p")) {
        firstEl.set_content(`${emoji} ${firstEl.innerHTML}`);
    } else if (firstEl && CALLOUT_BLOCK_TAGS.has(firstEl.tagName?.toLowerCase())) {
        contentDiv.insertAdjacentHTML("afterbegin", `<p>${emoji}</p>`);
    } else {
        contentDiv.insertAdjacentHTML("afterbegin", `${emoji} `);
    }
}
// #endregion

// #region Bookmarks
/**
 * Notion bookmark cards are `<figure><a class="bookmark source" href="…"><div class="bookmark-info">…`,
 * carrying a title, description and favicon. Trilium has the equivalent link-embed, so rewrite each into
 * `<section class="link-embed" data-…>` (an open-graph embed). Optional fields are only emitted when the
 * bookmark provides them.
 */
function convertBookmarks(root: HTMLElement) {
    for (const figure of root.querySelectorAll("figure")) {
        const url = figure.querySelector("a.bookmark")?.getAttribute("href");
        if (!url) {
            continue;
        }

        const section = parse(`<section></section>`).querySelector("section");
        if (!section) {
            continue;
        }
        section.setAttribute("class", "link-embed");
        section.setAttribute("data-url", url);
        section.setAttribute("data-embed-type", "opengraph");

        const optional: Record<string, string | undefined> = {
            "data-title": figure.querySelector(".bookmark-title")?.textContent?.trim(),
            "data-description": figure.querySelector(".bookmark-description")?.textContent?.trim(),
            "data-favicon": figure.querySelector("img.bookmark-icon")?.getAttribute("src")
        };
        for (const [key, value] of Object.entries(optional)) {
            if (value) {
                section.setAttribute(key, value);
            }
        }

        figure.replaceWith(section);
    }
}
// #endregion

// #region Link-to-page blocks
/**
 * Notion's "link to page" block is `<figure class="link-to-page"><a href="…page.html">Title</a></figure>`.
 * Reduce it to a paragraph holding the link; the href still points at the target page's exported file,
 * which the importer resolves to a Trilium internal/reference link once every page has a note.
 */
function convertLinkToPage(root: HTMLElement) {
    for (const figure of root.querySelectorAll("figure.link-to-page")) {
        const anchor = figure.querySelector("a");
        if (!anchor) {
            continue;
        }
        figure.insertAdjacentHTML("beforebegin", `<p>${anchor.toString()}</p>`);
        figure.remove();
    }
}
// #endregion

// #region Shared helpers
function isDisplayContents(node: HTMLElement): boolean {
    return isTag(node, "div") && (node.getAttribute("style") ?? "").replace(/\s/g, "").includes("display:contents");
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
// #endregion
