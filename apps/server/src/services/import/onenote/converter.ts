/**
 * Converts a OneNote page (a full HTML document returned by the Graph API) into the HTML body that
 * Trilium stores for a text note: structural normalization followed by sanitization.
 *
 * Background on the normalization: OneNote's content model is paragraph-based (each Enter is a new
 * <p>), but paragraphs render with zero spacing, and OneNote leans on bare <br> elements — including
 * at the BLOCK level, as siblings of <p>/<ol>/<ul> — to create vertical gaps. CKEditor has no place
 * for a block-level <br> (a soft break only lives inside a block) and provides its own inter-block
 * spacing, so importing OneNote's <br>-based spacing verbatim produces doubled gaps and stray empty
 * bullets. We therefore drop block-level <br> spacing and empty list items while preserving genuine
 * in-paragraph soft breaks.
 *
 * Still a first pass: images/attachments (served from authenticated Graph URLs) are not downloaded
 * yet, so embedded media will not render. See the summary for follow-up work.
 */

import { sanitize } from "@triliumnext/core";
import { HTMLElement, parse } from "node-html-parser";

/** Block containers whose direct <br> children are spacing artifacts rather than soft breaks. */
const BLOCK_CONTAINERS = new Set(["body", "div", "section", "article", "blockquote", "td", "th", "ol", "ul", "dl"]);

/** OneNote's highlight/font palette uses the 16 basic CSS color names; map them to hex (see below). */
const NAMED_COLORS = new Map<string, string>([
    ["yellow", "#ffff00"], ["lime", "#00ff00"], ["aqua", "#00ffff"], ["fuchsia", "#ff00ff"],
    ["blue", "#0000ff"], ["red", "#ff0000"], ["navy", "#000080"], ["teal", "#008080"],
    ["green", "#008000"], ["purple", "#800080"], ["maroon", "#800000"], ["olive", "#808000"],
    ["gray", "#808080"], ["silver", "#c0c0c0"], ["black", "#000000"], ["white", "#ffffff"]
]);

export function convertPageHtml(rawHtml: string): string {
    const root = parse(rawHtml);
    const scope = root.querySelector("body") ?? root;

    sortPositionedOutlines(scope);
    convertTodoTags(scope);
    convertInlineFormatting(scope);
    normalizeNamedColors(scope);
    removeEmptyListItems(scope);
    removeBlockLevelBreaks(scope);

    return sanitize.sanitizeHtml(scope.innerHTML);
}

/**
 * A OneNote page is a free-form canvas of absolutely-positioned text boxes (the top-level outline
 * <div>s). Their document order need not match their visual order, so reorder them top-to-bottom then
 * left-to-right to linearize the page into a sensible reading order. A no-op for the common
 * single-outline page.
 */
function sortPositionedOutlines(scope: HTMLElement) {
    const outlines = scope.childNodes.filter(
        (node): node is HTMLElement =>
            node instanceof HTMLElement && node.tagName?.toLowerCase() === "div" && parseStyle(node.getAttribute("style") ?? "").has("position")
    );
    if (outlines.length < 2) {
        return;
    }

    const coord = (el: HTMLElement, property: string) => parseFloat(parseStyle(el.getAttribute("style") ?? "").get(property) ?? "") || 0;
    const sorted = [...outlines].sort((a, b) => coord(a, "top") - coord(b, "top") || coord(a, "left") - coord(b, "left"));

    for (const outline of sorted) {
        outline.remove();
        scope.appendChild(outline);
    }
}

/**
 * OneNote marks checkboxes as `<p data-tag="to-do">` / `"to-do:completed"` paragraphs. Group runs of
 * consecutive to-do paragraphs into a single CKEditor task list (<ul class="todo-list">…), matching
 * the structure Trilium's TodoList editor plugin produces — completed items use a checked checkbox.
 */
function convertTodoTags(scope: HTMLElement) {
    const todos = scope.querySelectorAll("p[data-tag]").filter((el) => {
        const tag = el.getAttribute("data-tag");
        return tag === "to-do" || tag === "to-do:completed";
    });

    // Collect adjacent to-do paragraphs so each run becomes one list.
    const runs: HTMLElement[][] = [];
    for (const p of todos) {
        const currentRun = runs[runs.length - 1];
        if (currentRun && currentRun[currentRun.length - 1].nextElementSibling === p) {
            currentRun.push(p);
        } else {
            runs.push([p]);
        }
    }

    for (const run of runs) {
        const items = run.map((p) => {
            const checked = p.getAttribute("data-tag") === "to-do:completed" ? ` checked="checked"` : "";
            return `<li><label class="todo-list__label"><input type="checkbox"${checked}><span class="todo-list__label__description">${p.innerHTML}</span></label></li>`;
        });
        run[0].insertAdjacentHTML("beforebegin", `<ul class="todo-list">${items.join("")}</ul>`);
        run.forEach((p) => p.remove());
    }
}

/**
 * OneNote carries bold/italic/underline/strikethrough as inline styles (`font-weight:bold`,
 * `font-style:italic`, `text-decoration:underline`/`line-through`), which the sanitizer strips. Wrap
 * the styled element's content in the equivalent semantic tags (which survive sanitization) so the
 * formatting is preserved.
 */
function convertInlineFormatting(scope: HTMLElement) {
    for (const el of scope.querySelectorAll("[style]")) {
        const style = parseStyle(el.getAttribute("style") ?? "");
        const weight = style.get("font-weight");
        const decorations = (style.get("text-decoration") ?? "").split(/\s+/);

        const open: string[] = [];
        const close: string[] = [];
        const wrap = (tag: string) => {
            open.push(`<${tag}>`);
            close.unshift(`</${tag}>`);
        };

        if (weight === "bold" || Number(weight) >= 600) {
            wrap("strong");
        }
        if (style.get("font-style") === "italic") {
            wrap("em");
        }
        if (decorations.includes("underline")) {
            wrap("u");
        }
        // Trilium's editor represents strikethrough as <del> (see ckeditor5 StrikethroughAsDel), not <s>.
        if (decorations.includes("line-through")) {
            wrap("del");
        }
        // OneNote's "Code" style is just a Consolas font; map it to an inline <code> element.
        if ((style.get("font-family") ?? "").includes("consolas")) {
            wrap("code");
        }
        // OneNote's "Title" style is an oversized font; map it to CKEditor's "huge" font-size class.
        const sizeClass = fontSizeClass(style.get("font-size"), el);
        if (sizeClass) {
            open.push(`<span class="${sizeClass}">`);
            close.unshift("</span>");
        }

        if (open.length > 0) {
            el.set_content(`${open.join("")}${el.innerHTML}${close.join("")}`);
        }
    }
}

/**
 * Maps an oversized OneNote font-size to CKEditor's "huge" size class (the Title style is 20pt on an
 * 11pt base). Headings are skipped — their level already conveys size. Returns null otherwise.
 */
function fontSizeClass(value: string | undefined, el: HTMLElement): string | null {
    if (!value || /^h[1-6]$/.test(el.tagName?.toLowerCase() ?? "")) {
        return null;
    }
    const match = value.match(/^([\d.]+)\s*(pt|px)?$/);
    if (!match) {
        return null;
    }
    const points = match[2] === "px" ? parseFloat(match[1]) * 0.75 : parseFloat(match[1]);
    return points >= 18 ? "text-huge" : null;
}

/** Parses an inline `style` attribute into a property→value map (both lowercased). */
function parseStyle(style: string): Map<string, string> {
    const declarations = new Map<string, string>();
    for (const declaration of style.split(";")) {
        const separator = declaration.indexOf(":");
        if (separator > 0) {
            const property = declaration.slice(0, separator).trim().toLowerCase();
            const value = declaration.slice(separator + 1).trim().toLowerCase();
            declarations.set(property, value);
        }
    }
    return declarations;
}

/**
 * Rewrites CSS named color/background-color values (e.g. `yellow`) to hex so they pass the sanitizer's
 * color allowlist (which only permits hex/rgb/hsl). The styles stay as <span style="color|
 * background-color"> — the representation Trilium's FontColor / FontBackgroundColor editor plugins use.
 */
function normalizeNamedColors(scope: HTMLElement) {
    for (const el of scope.querySelectorAll("[style]")) {
        const style = parseStyle(el.getAttribute("style") ?? "");
        let changed = false;
        for (const property of ["color", "background-color"]) {
            const hex = NAMED_COLORS.get(style.get(property) ?? "");
            if (hex) {
                style.set(property, hex);
                changed = true;
            }
        }
        if (changed) {
            el.setAttribute("style", serializeStyle(style));
        }
    }
}

function serializeStyle(style: Map<string, string>): string {
    return [...style].map(([property, value]) => `${property}:${value}`).join(";");
}

/** Drops list items that hold nothing but whitespace/<br> (OneNote's "exited the list" remnant). */
function removeEmptyListItems(scope: HTMLElement) {
    for (const li of scope.querySelectorAll("li")) {
        const hasText = li.textContent.trim().length > 0;
        const hasNonBreakElement = li.querySelectorAll("*").some((el) => el.tagName?.toLowerCase() !== "br");
        if (!hasText && !hasNonBreakElement) {
            li.remove();
        }
    }
}

/** Removes <br> elements used as block-level spacing; soft breaks inside <p>/<span>/etc. are kept. */
function removeBlockLevelBreaks(scope: HTMLElement) {
    for (const br of scope.querySelectorAll("br")) {
        const parent = br.parentNode;
        if (parent instanceof HTMLElement && BLOCK_CONTAINERS.has(parent.tagName?.toLowerCase() ?? "")) {
            br.remove();
        }
    }
}

export default { convertPageHtml };
