/**
 * Resolves OneNote page-to-page hyperlinks against the notes created by an import.
 *
 * OneNote stores an internal link as an `onenote:` anchor carrying the target's identity in a
 * `page-id={GUID}` query parameter, e.g.
 *   `onenote:#Second%20page&section-id={…}&page-id={eb2c4f67-…}&end`
 * That GUID is NOT the Graph page `id` (a composite like `0-{guid}!{n}-{guid}`); the bridge between the
 * two is the page's own `links.oneNoteClientUrl`, which embeds the same `page-id={GUID}`. So the
 * importer builds a `page-id GUID → noteId` map from each imported page's client URL, then rewrites
 * every `onenote:` link whose target was imported into a Trilium internal link.
 *
 * Both pure functions here (extractPageId, rewritePageLinks) are deliberately free of any DB/Graph
 * dependency so the two-pass resolution can be unit-tested with a plain resolver callback.
 */

import { parse } from "node-html-parser";

/** Pulls the OneNote page-id GUID out of a link/URL, lowercased; null if there is none. */
export function extractPageId(url: string | null | undefined): string | null {
    const match = url?.match(/page-id=\{?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}?/i);
    return match ? match[1].toLowerCase() : null;
}

/**
 * Rewrites the page's `onenote:` internal links: a link whose target page-id resolves (via `resolve`)
 * to an imported note becomes a Trilium internal link (`#root/{noteId}`) with its original text kept;
 * links to pages outside the import — and all non-`onenote:` links (e.g. the "Web view" https link) —
 * are left untouched. Returns the input unchanged when nothing was rewritten, so callers can cheaply
 * detect a no-op.
 */
export function rewritePageLinks(html: string, resolve: (pageId: string) => string | null): string {
    const root = parse(html);
    let changed = false;

    for (const anchor of root.querySelectorAll("a")) {
        const href = anchor.getAttribute("href") ?? "";
        if (!href.startsWith("onenote:")) {
            continue;
        }
        const pageId = extractPageId(href);
        const noteId = pageId ? resolve(pageId) : null;
        if (noteId) {
            anchor.setAttribute("href", `#root/${noteId}`);
            changed = true;
        }
    }

    return changed ? root.toString() : html;
}
