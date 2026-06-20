/**
 * Converts a OneNote page (a full HTML document returned by the Graph API) into the HTML body that
 * Trilium stores for a text note.
 *
 * This is a deliberately minimal first pass: it extracts the document body and sanitizes it. The
 * Obsidian importer additionally rebuilds code blocks from Consolas-styled spans, converts MathML to
 * LaTeX, downloads attachments, and rasterizes ink to SVG — all of which are good future additions
 * but out of scope for this prototype. The OneNote "to-do" tags are converted here because they map
 * cleanly onto Trilium task-list checkboxes and are cheap to handle.
 *
 * NOTE: images and file attachments are referenced via authenticated Graph URLs and are NOT yet
 * downloaded, so embedded media will not render after import. See the summary for follow-up work.
 */

import { sanitize } from "@triliumnext/core";
import { parse } from "node-html-parser";

export function convertPageHtml(rawHtml: string): string {
    const root = parse(rawHtml);

    convertTodoTags(root);

    const body = root.querySelector("body");
    const inner = body ? body.innerHTML : rawHtml;

    return sanitize.sanitizeHtml(inner);
}

/** OneNote marks checkboxes with `data-tag="to-do"` / `"to-do:completed"`; render them as task items. */
function convertTodoTags(root: ReturnType<typeof parse>) {
    for (const el of root.querySelectorAll("[data-tag]")) {
        const tag = el.getAttribute("data-tag");
        if (tag === "to-do" || tag === "to-do:completed") {
            const checkbox = tag === "to-do:completed" ? "[x]" : "[ ]";
            el.set_content(`${checkbox} ${el.innerHTML}`);
        }
    }
}

export default { convertPageHtml };
