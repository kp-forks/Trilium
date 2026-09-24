import { createRef, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../services/i18n.js", () => ({
    t: (key: string) => key
}));
vi.mock("../text/ReadOnlyText.js", () => ({
    ReadOnlyTextContent: ({ html }: { html: string }) => <div className="markdown-stub">{html}</div>
}));

import ChatMessageList from "./ChatMessageList.js";
import type { ContentBlock } from "./llm_chat_types.js";
import type { UseLlmChatReturn } from "./useLlmChat.js";

let host: HTMLElement | undefined;

afterEach(() => {
    if (host) {
        render(null, host);
        host.remove();
        host = undefined;
    }
});

/** Render the list for a streaming turn with nothing stored yet. */
function renderStreamingTurn(streamingBlocks: ContentBlock[]) {
    host = document.body.appendChild(document.createElement("div"));
    const target = host;
    const chat = {
        messages: [],
        isStreaming: true,
        streamingStatus: "starting_agent",
        streamingThinking: "",
        streamingBlocks,
        pendingCitations: [],
        retryLast: () => undefined,
        scrollContainerRef: createRef(),
        messagesEndRef: createRef(),
        bottomSpacerRef: createRef(),
        showScrollToBottom: false,
        scrollToBottom: () => undefined
    } as unknown as UseLlmChatReturn;
    act(() => render(<ChatMessageList chat={chat} emptyStateText="empty" />, target));
    return target;
}

describe("ChatMessageList stream status", () => {
    it("names what the turn waits on until the reply's first content replaces it", () => {
        const waiting = renderStreamingTurn([]);
        expect(waiting.querySelector(".chat-stream-status")?.textContent).toBe("llm_chat.stream_status.starting_agent");
        render(null, waiting);
        waiting.remove();

        const replying = renderStreamingTurn([ { type: "text", content: "Hello" } ]);
        expect(replying.querySelector(".markdown-stub")?.textContent).toContain("Hello");
        expect(replying.querySelector(".chat-stream-status")).toBeNull();
    });
});
