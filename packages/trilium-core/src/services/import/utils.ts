import { unescapeHtml } from "../utils";

function handleH1(content: string, title: string) {
    // Drop the leading <h1> if it merely repeats the note title — the title is
    // rendered separately above the content, so keeping it would duplicate it.
    content = stripDuplicateTitleHeading(content, title);

    // If a content <h1> still remains, the author's hierarchy starts at level 1.
    // The editor reserves <h1> for the note title and only offers <h2>–<h6>, so
    // shift every heading down one level (clamping at <h6>) to preserve nesting.
    // Demoting <h1>→<h2> alone collapsed distinct <h1>/<h2> levels onto the same
    // <h2>, flattening the hierarchy (see #8383).
    if (/<h1[^>]*>[^<]*<\/h1>/i.test(content)) {
        content = shiftHeadingsDown(content);
    }

    return content;
}

/** Removes the first `<h1>` when its (decoded) text equals the note title. */
function stripDuplicateTitleHeading(content: string, title: string) {
    // No `g` flag: only the very first <h1> is a title candidate.
    return content.replace(/<h1[^>]*>([^<]*)<\/h1>/i, (match, text) =>
        unescapeHtml(text).trim() === title.trim() ? "" : match
    );
}

/**
 * Shifts every heading down one level so the content hierarchy fits the editor's
 * <h2>–<h6> range: <h2>–<h5> become <h3>–<h6>, the remaining <h1> become <h2>
 * (decoding their text to stay consistent with the title comparison), and <h6>
 * stays <h6> since there is no <h7> to shift into.
 */
function shiftHeadingsDown(content: string) {
    // Shift the sub-headings first so the <h1>→<h2> demotion below isn't re-shifted.
    return content
        .replace(/<(\/?)h([2-5])\b([^>]*)>/gi, (_match, slash, level, rest) =>
            `<${slash}h${Number(level) + 1}${rest}>`)
        .replace(/<h1[^>]*>([^<]*)<\/h1>/gi, (_match, text) =>
            `<h2>${unescapeHtml(text)}</h2>`);
}

function extractHtmlTitle(content: string): string | null {
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : null;
}

export default {
    handleH1,
    extractHtmlTitle
};
