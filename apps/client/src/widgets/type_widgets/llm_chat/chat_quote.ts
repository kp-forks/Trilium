/**
 * Format a selected stretch of a chat message as a Markdown blockquote for the reply input.
 *
 * Every line is prefixed with `> ` so the whole excerpt renders as one contiguous blockquote — blank
 * lines inside the selection become a bare `>` so the quote isn't split into two. A trailing
 * attribution line records which message the excerpt came from via a locale-independent `<<mid:…>>`
 * token, so `sourceLabel` (e.g. "Quoted from") can be translated freely. Leading and trailing blank
 * lines are dropped so the quote never carries stray empty rows.
 */
export function buildQuoteMarkdown(selectedText: string, messageId: string, sourceLabel: string): string {
    const lines = selectedText.replace(/\r\n/g, "\n").split("\n");
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

    const quoted = lines.map(line => (line.trim() ? `> ${line}` : ">"));
    quoted.push(`> (${sourceLabel} <<mid:${messageId}>>)`);
    return quoted.join("\n");
}

/** CSS class marking a rendered "Show quote source" link — used for click delegation and styling. */
export const MESSAGE_JUMP_CLASS = "chat-message-jump";

/** Href scheme for a quote-source link; the referenced message id follows the prefix. */
export const QUOTE_SOURCE_HREF_PREFIX = "#mid-";

// The message-id anchor embedded in a quote's attribution line. Locale-independent, so the transforms
// below never depend on the translated "Quoted from" wrapper. Ids are `[A-Za-z0-9]` (from randomString).
const MID_TOKEN = /<<mid:([A-Za-z0-9]+)>>/;
const MID_TOKEN_GLOBAL = /<<mid:([A-Za-z0-9]+)>>/g;

/**
 * Remove quote attribution lines (those carrying a `<<mid:…>>` token) from `markdown`, keeping the
 * quoted text. Used for anything that leaves the chat timeline — the LLM payload and saved notes —
 * where the message-id anchor is meaningless (and, to the LLM, distracting noise).
 */
export function stripQuoteSources(markdown: string): string {
    return markdown
        .split("\n")
        .filter(line => !MID_TOKEN.test(line))
        .join("\n");
}

/**
 * Rewrite each quote block's attribution line into a "Show quote source" link (Markdown) for display
 * in the chat timeline. Deliberately forgiving — this is a convenience, never critical:
 *  - a block with exactly one `<<mid:…>>` token gets the link (jumping to that message),
 *  - a block with none is left untouched (an ordinary user blockquote),
 *  - a block with two or more tokens is treated as malformed: its token lines are dropped and no link
 *    is shown, so nothing suspicious (or a raw token) ever surfaces.
 * `label` is the (localized) link text.
 */
export function renderQuoteSourceLinks(markdown: string, label: string): string {
    const lines = markdown.split("\n");
    const out: string[] = [];
    for (let i = 0; i < lines.length;) {
        if (!isQuoteLine(lines[i])) {
            out.push(lines[i]);
            i++;
            continue;
        }
        const start = i;
        while (i < lines.length && isQuoteLine(lines[i])) i++;
        out.push(...rewriteQuoteBlock(lines.slice(start, i), label));
    }
    return out.join("\n");
}

/** Whether a line belongs to a Markdown blockquote (starts with `>`). */
function isQuoteLine(line: string): boolean {
    return /^\s*>/.test(line);
}

/** Apply the one/none/many rule to a single contiguous blockquote block. */
function rewriteQuoteBlock(block: string[], label: string): string[] {
    const ids = block.flatMap(line => [...line.matchAll(MID_TOKEN_GLOBAL)].map(match => match[1]));
    if (ids.length === 0) return block;
    if (ids.length > 1) {
        return block.filter(line => !MID_TOKEN.test(line)); // ambiguous → drop token lines, no link
    }
    const link = `> [${label}](${QUOTE_SOURCE_HREF_PREFIX}${ids[0]})`;
    return block.map(line => (MID_TOKEN.test(line) ? link : line));
}
