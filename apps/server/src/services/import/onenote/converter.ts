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

export function convertPageHtml(rawHtml: string): string {
    const root = parse(rawHtml);
    const scope = root.querySelector("body") ?? root;

    convertTodoTags(scope);
    convertInlineFormatting(scope);
    removeEmptyListItems(scope);
    removeBlockLevelBreaks(scope);

    return sanitize.sanitizeHtml(scope.innerHTML);
}

/** OneNote marks checkboxes with `data-tag="to-do"` / `"to-do:completed"`; render them as task items. */
function convertTodoTags(scope: HTMLElement) {
    for (const el of scope.querySelectorAll("[data-tag]")) {
        const tag = el.getAttribute("data-tag");
        if (tag === "to-do" || tag === "to-do:completed") {
            const checkbox = tag === "to-do:completed" ? "[x]" : "[ ]";
            el.set_content(`${checkbox} ${el.innerHTML}`);
        }
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

        if (open.length > 0) {
            el.set_content(`${open.join("")}${el.innerHTML}${close.join("")}`);
        }
    }
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
