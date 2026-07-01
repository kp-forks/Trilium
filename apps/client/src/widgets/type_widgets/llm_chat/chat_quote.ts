/**
 * Format a selected stretch of a chat message as a Markdown blockquote for the reply input.
 *
 * Every line is prefixed with `> ` so the whole excerpt renders as one contiguous blockquote —
 * blank lines inside the selection become a bare `>` so the quote isn't split into two. A trailing
 * source line records which message the excerpt came from, which is useful context for the LLM.
 * Leading and trailing blank lines are dropped so the quote never carries stray empty rows.
 */
export function buildQuoteMarkdown(selectedText: string, messageId: string): string {
    const lines = selectedText.replace(/\r\n/g, "\n").split("\n");
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

    const quoted = lines.map(line => (line.trim() ? `> ${line}` : ">"));
    quoted.push(`> ${sourceLine(messageId)}`);
    return quoted.join("\n");
}

/** The trailing line of a quote block, recording which message the excerpt came from. */
function sourceLine(messageId: string): string {
    return `(Source: message ID ${messageId})`;
}

/** CSS class marking a rendered "message ID …" jump link — used for click delegation and styling. */
export const MESSAGE_JUMP_CLASS = "chat-message-jump";

/**
 * Matches the source line emitted by {@link sourceLine} in already-rendered message HTML. Kept next
 * to the builder so the two can't drift. The capture is the referenced message id — `[A-Za-z0-9]`
 * (from `randomString`), so it's safe to drop straight into an attribute without escaping.
 */
const SOURCE_LINE_PATTERN = /\(Source: message ID ([A-Za-z0-9]+)\)/g;

/**
 * Turn the "message ID …" text of a quote's source line into a link back to that message. A
 * render-time enhancement only — the stored and submitted text stays plain markdown, so the composer
 * and the LLM never see link markup. Apply to user-message HTML, where quote source lines live.
 */
export function linkifyMessageIdReferences(html: string): string {
    return html.replace(SOURCE_LINE_PATTERN, (_match, id) =>
        `(Source: <a class="${MESSAGE_JUMP_CLASS}" data-message-id="${id}">message ID ${id}</a>)`);
}
