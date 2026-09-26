import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../services/i18n.js", () => ({
    t: (key: string, options?: { total?: string; prompt?: string; completion?: string }) => {
        if (options?.total) return `${key}(${options.total})`;
        if (options?.completion) return `${key}(${options.prompt}/${options.completion})`;
        return key;
    }
}));
vi.mock("../text/ReadOnlyText.js", () => ({
    ReadOnlyTextContent: ({ html }: { html: string }) => <div className="markdown-stub">{html}</div>
}));

import ChatMessage from "./ChatMessage.js";
import type { StoredMessage } from "./llm_chat_types.js";

let host: HTMLElement | undefined;

afterEach(() => {
    if (host) {
        render(null, host);
        host.remove();
        host = undefined;
    }
});

function renderFooter(usage: StoredMessage["usage"]) {
    host = document.body.appendChild(document.createElement("div"));
    const target = host;
    const message: StoredMessage = { id: "m1", role: "assistant", content: "hello", createdAt: "2026-01-01T00:00:00.000Z", usage };
    act(() => render(<ChatMessage message={message} />, target));
    const footer = target.querySelector(".llm-chat-footer");
    expect(footer).not.toBeNull();
    return footer;
}

describe("ChatMessage footer", () => {
    it("names the model, and adds the tokens and cost when the provider reports them", () => {
        const full = renderFooter({ promptTokens: 1200, completionTokens: 300, totalTokens: 1500, cost: 0.5, model: "Claude Sonnet 5", provider: "anthropic" });
        expect(full?.querySelector(".llm-chat-usage-model")?.textContent).toBe("Sonnet 5");
        expect(full?.querySelector(".llm-chat-usage-tokens")?.textContent).toBe("llm_chat.total_tokens(1.5k)");
        expect(full?.querySelector(".llm-chat-usage-cost")?.textContent).toBe("~$0.50");
    });

    it("names the model of a provider that reports no tokens (the ACP agents)", () => {
        const footer = renderFooter({ model: "Gemini 3.8 Flash (Medium)", provider: "antigravity-agent" });
        expect(footer?.querySelector(".llm-chat-usage-model")?.textContent).toBe("Gemini 3.8 Flash (Medium)");
        expect(footer?.querySelector(".llm-chat-usage-tokens")).toBeNull();
    });

    it("counts the prompt as the total when a provider reports only that, and names no model it did not report", () => {
        const footer = renderFooter({ promptTokens: 800 });
        expect(footer?.querySelector(".llm-chat-usage-model")).toBeNull();
        const tokens = footer?.querySelector(".llm-chat-usage-tokens");
        expect(tokens?.textContent).toBe("llm_chat.total_tokens(800)");
        expect(tokens?.getAttribute("title")).toBe("llm_chat.tokens_detail(800/0)");
    });
});

describe("ChatMessage thinking", () => {
    function renderMessage(content: StoredMessage["content"], options: { type?: StoredMessage["type"]; isStreaming?: boolean } = {}) {
        host ??= document.body.appendChild(document.createElement("div"));
        const target = host;
        const message: StoredMessage = { id: "m1", role: "assistant", type: options.type, createdAt: "2026-01-01T00:00:00.000Z", content };
        act(() => render(<ChatMessage message={message} isStreaming={options.isStreaming} />, target));
        return target;
    }

    it("folds each finished thought to its title or first line, in stream order between the tool calls", () => {
        const target = renderMessage([
            { type: "thinking", content: "**Retrieving PC hostname with command**\n\nI'll read `/etc/hostname`." },
            { type: "tool_call", toolCall: { id: "c1", toolName: "shell", input: {}, result: "pc" } },
            { type: "thinking", content: "The file holds **the** `name`.\n\nNothing else to check." },
            { type: "text", content: "Your PC is called pc." }
        ]);

        const blocks = [...(target.querySelector(".llm-chat-message-content")?.children ?? [])];
        expect(blocks.map(el => el.classList.contains("llm-chat-thinking"))).toEqual([true, false, true, false]);

        const [titled, untitled] = target.querySelectorAll(".llm-chat-thinking");
        expect(titled instanceof HTMLDetailsElement && !titled.open).toBe(true);
        expect(titled.querySelector(".expandable-section-label")?.textContent).toBe("Retrieving PC hostname with command");
        const body = titled.querySelector(".llm-chat-thinking-content .markdown-stub")?.textContent;
        expect(body).toContain("<code>/etc/hostname</code>");
        expect(body).not.toContain("Retrieving PC hostname");
        expect(untitled.querySelector(".expandable-section-label")?.textContent).toBe("The file holds the name.");
        const untitledBody = untitled.querySelector(".llm-chat-thinking-content .markdown-stub")?.textContent;
        expect(untitledBody).toContain("Nothing else to check.");
        expect(untitledBody).not.toContain("holds");
    });

    it("leaves a one-line thought without a body, since its label already says it all", () => {
        const target = renderMessage([{ type: "thinking", content: "I should look up who maintains it." }]);
        const thought = target.querySelector(".llm-chat-thinking");
        expect(thought?.querySelector(".expandable-section-label")?.textContent).toBe("I should look up who maintains it.");
        expect(thought?.querySelector(".llm-chat-thinking-content")).toBeNull();
    });

    it("shows the thought being generated under a spinner and its latest title, and folds it once the turn moves on", () => {
        const thought = { type: "thinking" as const, content: "**Reading the hostname**\n\nFirst.\n\n**Checking the network**\n\nSecond." };
        let target = renderMessage([thought], { isStreaming: true });
        let card = target.querySelector(".llm-chat-thinking");
        expect(card?.classList.contains("llm-chat-thinking-live")).toBe(true);
        expect(card?.querySelector("details")).toBeNull();
        expect(card?.querySelector(".bx-spin")).not.toBeNull();
        expect(card?.querySelector(".llm-chat-thinking-title")?.textContent).toBe("Checking the network");
        expect(card?.querySelector(".llm-chat-thinking-content .markdown-stub")?.textContent).toContain("Second.");

        target = renderMessage([thought, { type: "tool_call", toolCall: { id: "c1", toolName: "shell", input: {} } }], { isStreaming: true });
        card = target.querySelector(".llm-chat-thinking");
        expect(card?.classList.contains("llm-chat-thinking-live")).toBe(false);
        expect(card instanceof HTMLDetailsElement && !card.open).toBe(true);
        expect(card?.querySelector(".expandable-section-label")?.textContent).toBe("Reading the hostname");
    });

    it("renders a stored thinking message from before thoughts moved into the reply", () => {
        const target = renderMessage("**Retrieving PC hostname with command**\n\nI'll read `/etc/hostname`.", { type: "thinking" });
        const card = target.querySelector(".llm-chat-thinking");
        expect(card?.querySelector(".expandable-section-label")?.textContent).toBe("Retrieving PC hostname with command");
        expect(card?.querySelector(".llm-chat-thinking-content .markdown-stub")?.textContent).toContain("<code>/etc/hostname</code>");
    });
});
