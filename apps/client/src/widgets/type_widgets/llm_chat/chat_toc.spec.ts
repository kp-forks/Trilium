import { describe, expect, it, vi } from "vitest";

import { buildChatHeadings, pickActiveHeadingId, truncateForToc } from "./chat_toc.js";
import type { ContentBlock, StoredMessage } from "./llm_chat_types.js";

// i18next isn't initialized in unit tests, so stub `t` with a minimal interpolating
// implementation to make the localized "File: " prefix deterministic.
vi.mock("../../../services/i18n.js", () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
        key === "llm_chat.toc_file" ? `File: ${opts?.name}` : key
}));

describe("truncateForToc", () => {
    it("returns short text unchanged", () => {
        expect(truncateForToc("Hello world")).toBe("Hello world");
    });

    it("returns an empty string for blank/whitespace-only input", () => {
        expect(truncateForToc("")).toBe("");
        expect(truncateForToc("   \n\t  ")).toBe("");
    });

    it("collapses internal whitespace and newlines into single spaces", () => {
        expect(truncateForToc("Hello   \n\t  world")).toBe("Hello world");
    });

    it("trims leading and trailing whitespace", () => {
        expect(truncateForToc("  Hello world  ")).toBe("Hello world");
    });

    it("keeps at most the default number of words and appends an ellipsis", () => {
        const result = truncateForToc("one two three four five six seven eight nine");
        expect(result).toBe("one two three four five six seven…");
    });

    it("does not append an ellipsis when the word count is exactly at the limit", () => {
        expect(truncateForToc("one two three four five six seven")).toBe("one two three four five six seven");
    });

    it("honours a custom word limit", () => {
        expect(truncateForToc("alpha beta gamma delta", { maxWords: 2 })).toBe("alpha beta…");
    });

    it("does not leave trailing punctuation or spaces before the ellipsis", () => {
        // The 7th word is "seven"; the comma after it must be dropped along with the tail.
        expect(truncateForToc("one two three four five six seven, eight nine")).toBe("one two three four five six seven…");
    });

    it("preserves punctuation that sits between kept words", () => {
        expect(truncateForToc("Hello, world! How are you", { maxWords: 3 })).toBe("Hello, world! How…");
    });

    it("hard-caps a single very long malformed word at the default maxChars (ellipsis included)", () => {
        const longWord = "a".repeat(1000);
        const result = truncateForToc(longWord);
        expect([...result]).toHaveLength(128);
        expect(result.endsWith("…")).toBe(true);
        expect(result.startsWith("a".repeat(127))).toBe(true);
    });

    it("respects a custom character cap", () => {
        const result = truncateForToc("x".repeat(50), { maxChars: 10 });
        expect([...result]).toHaveLength(10);
        expect(result).toBe(`${"x".repeat(9)}…`);
    });

    it("never exceeds maxChars even when both word and char limits fire", () => {
        const words = Array.from({ length: 20 }, () => "z".repeat(40)).join(" ");
        const result = truncateForToc(words, { maxWords: 7, maxChars: 100 });
        expect([...result].length).toBeLessThanOrEqual(100);
        expect(result.endsWith("…")).toBe(true);
    });

    describe("cross-culture word segmentation", () => {
        it("counts Chinese words without relying on spaces", () => {
            // "你好世界" has no spaces; Intl.Segmenter still splits it into words, so the
            // ellipsis proves a genuine word boundary was found rather than a whitespace split.
            const result = truncateForToc("你好世界再见朋友们今天天气很好", { maxWords: 3 });
            expect(result.endsWith("…")).toBe(true);
            expect(result.length).toBeGreaterThan(0);
        });

        it("handles German text with punctuation", () => {
            expect(truncateForToc("Größe und Straße sind Wörter", { maxWords: 3 })).toBe("Größe und Straße…");
        });

        it("keeps Romanian diacritics intact", () => {
            expect(truncateForToc("Această propoziție are cuvinte", { maxWords: 2 })).toBe("Această propoziție…");
        });

        it("does not split multi-code-point emoji when capping characters", () => {
            // A family emoji is several code points joined by ZWJ but one grapheme; the cap
            // must not slice through it and leave a broken cluster.
            const emoji = "👨‍👩‍👧‍👦";
            const result = truncateForToc(emoji.repeat(300), { maxWords: 100, maxChars: 5 });
            // 4 whole emoji + the ellipsis; no lone surrogate fragments.
            expect(result).toBe(`${emoji.repeat(4)}…`);
        });
    });
});

describe("buildChatHeadings", () => {
    function userMessage(id: string, content: string | ContentBlock[]): StoredMessage {
        return { id, role: "user", content, createdAt: "2026-01-01T00:00:00.000Z" };
    }
    function assistantMessage(id: string, content: string): StoredMessage {
        return { id, role: "assistant", content, createdAt: "2026-01-01T00:00:00.000Z" };
    }

    it("emits one entry per user message, in order, skipping assistant messages", () => {
        const headings = buildChatHeadings([
            userMessage("u1", "First question"),
            assistantMessage("a1", "First answer"),
            userMessage("u2", "Second question")
        ]);
        expect(headings).toEqual([
            { id: "u1", level: 1, text: "First question" },
            { id: "u2", level: 1, text: "Second question" }
        ]);
    });

    it("uses the message id as the heading id so it doubles as a scroll anchor", () => {
        const [heading] = buildChatHeadings([userMessage("abc123", "Hi")]);
        expect(heading.id).toBe("abc123");
    });

    it("escapes HTML in the message so it renders literally", () => {
        const [heading] = buildChatHeadings([userMessage("u1", "<script>alert(1)</script>")]);
        expect(heading.text).not.toContain("<script>");
        expect(heading.text).toContain("&lt;script&gt;");
    });

    it("extracts the text from block-shaped content", () => {
        const content: ContentBlock[] = [
            { type: "image", attachmentId: "att1", mime: "image/png", title: "pic.png", url: "/x" },
            { type: "text", content: "Describe this image" }
        ];
        const [heading] = buildChatHeadings([userMessage("u1", content)]);
        expect(heading.text).toBe("Describe this image");
    });

    it("prefixes the localized \"File: \" label for image-only messages", () => {
        const content: ContentBlock[] = [
            { type: "image", attachmentId: "att1", mime: "image/png", title: "diagram.png", url: "/x" }
        ];
        const [heading] = buildChatHeadings([userMessage("u1", content)]);
        expect(heading.text).toBe("File: diagram.png");
    });

    it("prefixes a localized \"File: \" label for file-only messages", () => {
        const content: ContentBlock[] = [
            { type: "file", attachmentId: "att1", mime: "application/pdf", title: "report.pdf", url: "/x" }
        ];
        const [heading] = buildChatHeadings([userMessage("u1", content)]);
        expect(heading.text).toBe("File: report.pdf");
    });

    it("prefixes the \"File: \" label for text-file-only messages too", () => {
        const content: ContentBlock[] = [
            { type: "text_file", attachmentId: "att1", mime: "text/markdown", title: "notes.md", url: "/x" }
        ];
        const [heading] = buildChatHeadings([userMessage("u1", content)]);
        expect(heading.text).toBe("File: notes.md");
    });
});

describe("pickActiveHeadingId", () => {
    it("returns null when there are no entries", () => {
        expect(pickActiveHeadingId([], 100)).toBeNull();
    });

    it("highlights the first entry when nothing has been scrolled past the line", () => {
        const entries = [
            { id: "a", top: 300 },
            { id: "b", top: 600 }
        ];
        expect(pickActiveHeadingId(entries, 100)).toBe("a");
    });

    it("highlights the last entry whose top is at or above the activation line", () => {
        const entries = [
            { id: "a", top: -200 },
            { id: "b", top: 50 },
            { id: "c", top: 400 }
        ];
        expect(pickActiveHeadingId(entries, 100)).toBe("b");
    });

    it("treats an entry exactly on the line as scrolled past", () => {
        const entries = [
            { id: "a", top: -50 },
            { id: "b", top: 100 }
        ];
        expect(pickActiveHeadingId(entries, 100)).toBe("b");
    });

    it("highlights the final entry when the timeline is scrolled to the bottom", () => {
        const entries = [
            { id: "a", top: -900 },
            { id: "b", top: -600 },
            { id: "c", top: -100 }
        ];
        expect(pickActiveHeadingId(entries, 100)).toBe("c");
    });
});
