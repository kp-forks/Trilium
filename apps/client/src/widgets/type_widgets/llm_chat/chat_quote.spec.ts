import { describe, expect, it } from "vitest";

import { buildQuoteMarkdown, linkifyMessageIdReferences, MESSAGE_JUMP_CLASS } from "./chat_quote.js";

describe("buildQuoteMarkdown", () => {
    it("quotes a single line and appends the source", () => {
        expect(buildQuoteMarkdown("The answer is 42.", "msg123")).toBe(
            "> The answer is 42.\n" +
            "> (Source: message ID msg123)"
        );
    });

    it("prefixes every line of a multi-line selection", () => {
        expect(buildQuoteMarkdown("first line\nsecond line", "abc")).toBe(
            "> first line\n" +
            "> second line\n" +
            "> (Source: message ID abc)"
        );
    });

    it("keeps blank lines inside the selection as a bare '>' so the quote stays contiguous", () => {
        expect(buildQuoteMarkdown("para one\n\npara two", "abc")).toBe(
            "> para one\n" +
            ">\n" +
            "> para two\n" +
            "> (Source: message ID abc)"
        );
    });

    it("drops leading and trailing blank lines but keeps the source line", () => {
        expect(buildQuoteMarkdown("\n  \nkept\n \n", "abc")).toBe(
            "> kept\n" +
            "> (Source: message ID abc)"
        );
    });

    it("normalizes CRLF line endings", () => {
        expect(buildQuoteMarkdown("a\r\nb", "abc")).toBe(
            "> a\n" +
            "> b\n" +
            "> (Source: message ID abc)"
        );
    });

    it("does not escape or alter Markdown characters within the quoted text", () => {
        expect(buildQuoteMarkdown("# heading with > and *stars*", "abc")).toBe(
            "> # heading with > and *stars*\n" +
            "> (Source: message ID abc)"
        );
    });

    it("returns just the source line when the selection is all whitespace", () => {
        expect(buildQuoteMarkdown("   \n\n", "abc")).toBe("> (Source: message ID abc)");
    });
});

describe("linkifyMessageIdReferences", () => {
    it("wraps the message id in a jump link, leaving surrounding text intact", () => {
        expect(linkifyMessageIdReferences("<p>(Source: message ID abc123)</p>")).toBe(
            `<p>(Source: <a class="${MESSAGE_JUMP_CLASS}" data-message-id="abc123">message ID abc123</a>)</p>`
        );
    });

    it("linkifies the source line produced by buildQuoteMarkdown", () => {
        const source = buildQuoteMarkdown("hello", "Xy9Z");
        // Simulate the rendered prose (the phrase survives markdown rendering verbatim).
        expect(linkifyMessageIdReferences(source)).toContain(
            `<a class="${MESSAGE_JUMP_CLASS}" data-message-id="Xy9Z">message ID Xy9Z</a>`
        );
    });

    it("leaves text without a source line unchanged", () => {
        expect(linkifyMessageIdReferences("<p>just a normal message</p>")).toBe("<p>just a normal message</p>");
    });

    it("links every occurrence when a message quotes more than once", () => {
        const html = linkifyMessageIdReferences("(Source: message ID aaa) ... (Source: message ID bbb)");
        expect(html).toContain(`data-message-id="aaa"`);
        expect(html).toContain(`data-message-id="bbb"`);
    });
});
