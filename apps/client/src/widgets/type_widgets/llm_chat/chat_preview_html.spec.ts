import { describe, expect, it } from "vitest";

import { renderChatPreviewHtml } from "./chat_preview_html.js";
import type { StoredMessage } from "./llm_chat_types.js";

function message(overrides: Partial<StoredMessage> = {}): StoredMessage {
    return {
        id: "m1",
        role: "user",
        content: "hello",
        createdAt: "2026-01-01T00:00:00.000Z",
        ...overrides
    };
}

describe("renderChatPreviewHtml", () => {
    it("renders each message as a role-classed bubble with its markdown", () => {
        const html = renderChatPreviewHtml([
            message({ id: "m1", role: "user", content: "What is **42**?" }),
            message({ id: "m2", role: "assistant", content: [{ type: "text", content: "The answer." }] })
        ]);

        expect(html).toContain("llm-chat-message-wrapper-user");
        expect(html).toContain("llm-chat-message-wrapper-assistant");
        expect(html).toContain("<strong>42</strong>");
        expect(html).toContain("The answer.");
    });

    it("renders an error message as a caution admonition with escaped text", () => {
        const html = renderChatPreviewHtml([
            message({ role: "assistant", type: "error", content: "failed <script>" })
        ]);

        expect(html).toContain('class="admonition caution llm-chat-error"');
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
    });

    it("skips thinking messages and messages with no text (tool calls, attachments only)", () => {
        const html = renderChatPreviewHtml([
            message({ id: "m1", type: "thinking", content: "pondering" }),
            message({
                id: "m2",
                role: "assistant",
                content: [{ type: "tool_call", toolCall: { id: "t1", toolName: "search_notes", input: {} } }]
            }),
            message({ id: "m3", role: "user", content: "kept" })
        ]);

        expect(html).not.toContain("pondering");
        expect(html).not.toContain("search_notes");
        expect(html).toContain("kept");
        expect(html.match(/llm-chat-message-wrapper /g)).toHaveLength(1);
    });

    it("caps the number of previewed messages", () => {
        const messages = Array.from({ length: 25 }, (_, i) => message({ id: `m${i}`, content: `msg-${i}` }));
        const html = renderChatPreviewHtml(messages);

        expect(html).toContain("msg-9");
        expect(html).not.toContain("msg-10");
    });

    it("returns an empty string when nothing is worth previewing", () => {
        expect(renderChatPreviewHtml([])).toBe("");
        expect(renderChatPreviewHtml([message({ content: "   " })])).toBe("");
    });
});
