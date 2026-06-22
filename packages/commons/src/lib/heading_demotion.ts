/** Decodes HTML entities in heading text; supplied by each {@link demoteHeadings} caller. */
export type EntityDecoder = (str: string) => string;

/**
 * Trilium reserves `<h1>` for the note title and the editor only supports
 * `<h2>`–`<h6>`. When rendered/imported content starts its hierarchy at `<h1>`,
 * naively demoting every `<h1>` to `<h2>` while leaving `<h2>`–`<h6>` untouched
 * collapses distinct levels onto the same `<h2>`, flattening the nesting (#8383).
 *
 * This strips the leading `<h1>` if it duplicates the title, then — if a content
 * `<h1>` still remains — shifts the whole hierarchy down one level so the author's
 * structure is preserved.
 *
 * The entity decoder is injected so each call-site keeps its own `unescapeHtml`
 * semantics: the markdown renderer decodes numeric/hex/named entities, while the
 * HTML importer decodes only the five basic ones (matching `api.unescapeHtml`).
 */
export function demoteHeadings(
    content: string,
    title: string,
    unescapeHtml: EntityDecoder
): string {
    content = stripDuplicateTitleHeading(content, title, unescapeHtml);

    // If a content <h1> still remains, the hierarchy starts at level 1: shift every
    // heading down one level (clamping at <h6>) so nesting is preserved instead of
    // collapsing distinct <h1>/<h2> levels onto the same <h2>.
    if (/<h1[^>]*>[\s\S]*?<\/h1>/i.test(content)) {
        content = shiftHeadingsDown(content, unescapeHtml);
    }

    return content;
}

/** Removes the first `<h1>` when its (decoded) text equals the note title. */
function stripDuplicateTitleHeading(
    content: string,
    title: string,
    unescapeHtml: EntityDecoder
): string {
    // No `g` flag: only the very first <h1> is a title candidate. `[\s\S]*?` (not
    // `[^<]*`) so headings with inline markup or attributes still match.
    return content.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/i, (match, text: string) =>
        unescapeHtml(text).trim() === title.trim() ? "" : match
    );
}

/**
 * Shifts `<h2>`–`<h5>` to `<h3>`–`<h6>` and the remaining `<h1>` to `<h2>`
 * (preserving attributes and decoding text). `<h6>` stays put — there is no `<h7>`.
 */
function shiftHeadingsDown(content: string, unescapeHtml: EntityDecoder): string {
    // Shift the sub-headings first so the <h1>→<h2> demotion below isn't re-shifted.
    // `[\s\S]*?` matches headings containing inline markup; the captured attributes
    // are carried over to the demoted <h2>.
    return content
        .replace(/<(\/?)h([2-5])\b([^>]*)>/gi, (_match, slash, level, rest) =>
            `<${slash}h${Number(level) + 1}${rest}>`)
        .replace(/<h1([^>]*)>([\s\S]*?)<\/h1>/gi, (_match, attrs, text) =>
            `<h2${attrs}>${unescapeHtml(text)}</h2>`);
}
