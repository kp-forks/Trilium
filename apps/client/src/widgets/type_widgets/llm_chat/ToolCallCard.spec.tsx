import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../services/i18n.js", () => ({
    t: (key: string, options?: { defaultValue?: string }) => (key.startsWith("llm.tools.") ? key.slice("llm.tools.".length) : options?.defaultValue ?? key)
}));
vi.mock("../../react/NoteLink.js", () => ({
    NewNoteLink: ({ notePath }: { notePath: string }) => <a className="note-link-stub">{notePath}</a>
}));

import ToolCallCard from "./ToolCallCard.js";
import type { ToolCall } from "./llm_chat_types.js";

let host: HTMLElement | undefined;

afterEach(() => {
    if (host) {
        render(null, host);
        host.remove();
        host = undefined;
    }
});

function renderCard(toolCalls: ToolCall[]) {
    host = document.body.appendChild(document.createElement("div"));
    const target = host;
    act(() => render(<ToolCallCard toolCalls={toolCalls} />, target));
    return target;
}

describe("ToolCallCard", () => {
    it("shows what a call looked for: the name, the query, or the page it read", () => {
        const card = renderCard([
            { id: "1", toolName: "search_icons", input: { query: "rocket" }, result: "[]" },
            { id: "2", toolName: "web_search", input: { query: "weather Sibiu" }, result: "Sunny" },
            { id: "3", toolName: "read_web_page", input: { url: "https://triliumnotes.org" }, result: "Fetched" }
        ]);
        expect([ ...card.querySelectorAll(".llm-chat-tool-call-detail") ].map(detail => detail.textContent))
            .toEqual([ "rocket", "weather Sibiu", "https://triliumnotes.org" ]);
    });

    it("lists the calls as bare disclosure lines rather than in a card", () => {
        const target = renderCard([
            { id: "1", toolName: "get_note", input: { noteId: "a" }, result: "{}" },
            { id: "2", toolName: "get_note", input: { noteId: "b" }, result: "{}" },
            { id: "3", toolName: "web_search", input: { query: "rocket" }, result: "Sunny" }
        ]);
        expect(target.querySelector(".expandable-card")).toBeNull();
        const lines = [ ...(target.querySelector(".llm-chat-tool-calls")?.children ?? []) ];
        expect(lines.map(line => line instanceof HTMLDetailsElement && line.classList.contains("llm-chat-tool-call")))
            .toEqual([ true, true ]);
        expect(lines[0]?.querySelectorAll(".expandable-section-body > details.llm-chat-tool-call")).toHaveLength(2);
    });
});
