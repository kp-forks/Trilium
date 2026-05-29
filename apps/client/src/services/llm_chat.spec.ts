import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LlmChatConfig, LlmMessage } from "@triliumnext/commons";

import { getAvailableModels, streamChatCompletion, type StreamCallbacks } from "./llm_chat.js";
import server from "./server.js";

/**
 * Build a Response-like object whose body streams the given SSE chunks.
 * Each chunk is decoded by the production code with a TextDecoder.
 */
function makeStreamResponse(chunks: string[], opts: { ok?: boolean; status?: number; statusText?: string; noBody?: boolean } = {}): Response {
    const encoder = new TextEncoder();
    let i = 0;
    const reader = {
        read: vi.fn(async () => {
            if (i < chunks.length) {
                return { done: false, value: encoder.encode(chunks[i++]) };
            }
            return { done: true, value: undefined };
        }),
        releaseLock: vi.fn()
    };

    return {
        ok: opts.ok ?? true,
        status: opts.status ?? 200,
        statusText: opts.statusText ?? "OK",
        body: opts.noBody ? null : { getReader: () => reader }
    } as unknown as Response;
}

function makeCallbacks(): Record<keyof StreamCallbacks, ReturnType<typeof vi.fn>> & StreamCallbacks {
    return {
        onChunk: vi.fn(),
        onThinking: vi.fn(),
        onToolInputStart: vi.fn(),
        onToolInputDelta: vi.fn(),
        onToolUse: vi.fn(),
        onToolResult: vi.fn(),
        onCitation: vi.fn(),
        onUsage: vi.fn(),
        onError: vi.fn(),
        onDone: vi.fn()
    } as Record<keyof StreamCallbacks, ReturnType<typeof vi.fn>> & StreamCallbacks;
}

const messages: LlmMessage[] = [{ role: "user", content: "hi" }];
const config = {} as LlmChatConfig;

describe("getAvailableModels", () => {
    it("returns the models array from the server response", async () => {
        const models = [{ name: "gpt", provider: "openai" }];
        server.get = vi.fn(async () => ({ models })) as typeof server.get;
        await expect(getAvailableModels()).resolves.toBe(models);
        expect(server.get).toHaveBeenCalledWith("llm-chat/models");
    });

    it("defaults to an empty array when models is absent", async () => {
        server.get = vi.fn(async () => ({})) as typeof server.get;
        await expect(getAvailableModels()).resolves.toEqual([]);
    });
});

describe("streamChatCompletion", () => {
    beforeEach(() => {
        server.getHeaders = vi.fn(async () => ({ "x-csrf-token": "tok" })) as typeof server.getHeaders;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("posts messages/config with merged headers and consumes the stream", async () => {
        const fetchMock = vi.fn(async () => makeStreamResponse([`data: ${JSON.stringify({ type: "text", content: "hello" })}\n`]));
        vi.stubGlobal("fetch", fetchMock);

        const cb = makeCallbacks();
        await streamChatCompletion(messages, config, cb);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toContain("llm-chat/stream");
        expect(init.method).toBe("POST");
        expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
        expect((init.headers as Record<string, string>)["x-csrf-token"]).toBe("tok");
        expect(init.body).toBe(JSON.stringify({ messages, config }));
        expect(cb.onChunk).toHaveBeenCalledWith("hello");
    });

    it("rethrows an AbortError from fetch (user stopped)", async () => {
        const abort = new DOMException("aborted", "AbortError");
        vi.stubGlobal("fetch", vi.fn(async () => { throw abort; }));

        const cb = makeCallbacks();
        await expect(streamChatCompletion(messages, config, cb)).rejects.toBe(abort);
        expect(cb.onError).not.toHaveBeenCalled();
    });

    it("reports a connection failure for a non-abort Error from fetch", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));

        const cb = makeCallbacks();
        await streamChatCompletion(messages, config, cb);
        expect(cb.onError).toHaveBeenCalledWith("Failed to connect to LLM stream: boom");
    });

    it("reports a connection failure for a non-Error thrown by fetch", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => { throw "stringly"; }));

        const cb = makeCallbacks();
        await streamChatCompletion(messages, config, cb);
        expect(cb.onError).toHaveBeenCalledWith("Failed to connect to LLM stream: stringly");
    });

    it("reports an HTTP error when the response is not ok", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => makeStreamResponse([], { ok: false, status: 503, statusText: "Unavailable" })));

        const cb = makeCallbacks();
        await streamChatCompletion(messages, config, cb);
        expect(cb.onError).toHaveBeenCalledWith("HTTP 503: Unavailable");
    });

    it("reports a missing body when there is no reader", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => makeStreamResponse([], { noBody: true })));

        const cb = makeCallbacks();
        await streamChatCompletion(messages, config, cb);
        expect(cb.onError).toHaveBeenCalledWith("No response body");
    });

    it("dispatches every SSE event type to the matching callback", async () => {
        const events = [
            { type: "text", content: "T" },
            { type: "thinking", content: "TH" },
            { type: "tool_input_start", toolCallId: "c1", toolName: "search" },
            { type: "tool_input_delta", toolCallId: "c1", delta: "{" },
            { type: "tool_use", toolCallId: "c1", toolName: "search", toolInput: { q: "x" } },
            { type: "tool_result", toolCallId: "c1", toolName: "search", result: "res", isError: false },
            { type: "citation", citation: { id: "cit1" } },
            { type: "usage", usage: { totalTokens: 10 } },
            { type: "done" },
            { type: "unknown_ignored" }
        ];
        // Split a "data: " line across two chunks to exercise the buffer carry-over,
        // and include a blank/non-data line which must be ignored.
        const chunks = [
            ...events.map((e) => `data: ${JSON.stringify(e)}\n`),
            "ignored non-data line\n",
            "data: " // trailing partial line left in the buffer (never flushed)
        ];
        vi.stubGlobal("fetch", vi.fn(async () => makeStreamResponse(chunks)));

        const cb = makeCallbacks();
        await streamChatCompletion(messages, config, cb);

        expect(cb.onChunk).toHaveBeenCalledWith("T");
        expect(cb.onThinking).toHaveBeenCalledWith("TH");
        expect(cb.onToolInputStart).toHaveBeenCalledWith("c1", "search");
        expect(cb.onToolInputDelta).toHaveBeenCalledWith("c1", "{");
        expect(cb.onToolUse).toHaveBeenCalledWith("c1", "search", { q: "x" });
        expect(cb.onToolResult).toHaveBeenCalledWith("c1", "search", "res", false);
        expect(cb.onCitation).toHaveBeenCalledWith({ id: "cit1" });
        expect(cb.onUsage).toHaveBeenCalledWith({ totalTokens: 10 });
        expect(cb.onDone).toHaveBeenCalledTimes(1);
    });

    it("ignores citation/usage events that carry no payload", async () => {
        const chunks = [
            `data: ${JSON.stringify({ type: "citation" })}\n`,
            `data: ${JSON.stringify({ type: "usage" })}\n`
        ];
        vi.stubGlobal("fetch", vi.fn(async () => makeStreamResponse(chunks)));

        const cb = makeCallbacks();
        await streamChatCompletion(messages, config, cb);
        expect(cb.onCitation).not.toHaveBeenCalled();
        expect(cb.onUsage).not.toHaveBeenCalled();
    });

    it("forwards an error event to onError", async () => {
        const chunks = [`data: ${JSON.stringify({ type: "error", error: "model failed" })}\n`];
        vi.stubGlobal("fetch", vi.fn(async () => makeStreamResponse(chunks)));

        const cb = makeCallbacks();
        await streamChatCompletion(messages, config, cb);
        expect(cb.onError).toHaveBeenCalledWith("model failed");
    });

    it("skips optional callbacks that are not provided", async () => {
        const events = [
            { type: "thinking", content: "TH" },
            { type: "tool_input_start", toolCallId: "c1", toolName: "search" },
            { type: "tool_input_delta", toolCallId: "c1", delta: "{" },
            { type: "tool_use", toolCallId: "c1", toolName: "search", toolInput: { q: "x" } },
            { type: "tool_result", toolCallId: "c1", toolName: "search", result: "res" },
            { type: "citation", citation: { id: "cit1" } },
            { type: "usage", usage: { totalTokens: 1 } }
        ];
        const chunks = events.map((e) => `data: ${JSON.stringify(e)}\n`);
        vi.stubGlobal("fetch", vi.fn(async () => makeStreamResponse(chunks)));

        // Only the required callbacks are present; optional `?.` invocations must be no-ops.
        const cb: StreamCallbacks = { onChunk: vi.fn(), onError: vi.fn(), onDone: vi.fn() };
        await expect(streamChatCompletion(messages, config, cb)).resolves.toBeUndefined();
        expect(cb.onError).not.toHaveBeenCalled();
    });

    it("logs and skips an SSE line that is not valid JSON", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        const chunks = ["data: {not json}\n"];
        vi.stubGlobal("fetch", vi.fn(async () => makeStreamResponse(chunks)));

        const cb = makeCallbacks();
        await streamChatCompletion(messages, config, cb);
        expect(consoleError).toHaveBeenCalled();
        expect(cb.onChunk).not.toHaveBeenCalled();
    });

    it("rethrows an AbortError raised while reading the stream", async () => {
        const abort = new DOMException("aborted", "AbortError");
        const reader = { read: vi.fn(async () => { throw abort; }), releaseLock: vi.fn() };
        const response = { ok: true, status: 200, statusText: "OK", body: { getReader: () => reader } } as unknown as Response;
        vi.stubGlobal("fetch", vi.fn(async () => response));

        const cb = makeCallbacks();
        await expect(streamChatCompletion(messages, config, cb)).rejects.toBe(abort);
        expect(reader.releaseLock).toHaveBeenCalledTimes(1);
        expect(cb.onError).not.toHaveBeenCalled();
    });

    it("reports a non-abort Error raised while reading the stream", async () => {
        const reader = { read: vi.fn(async () => { throw new Error("read failed"); }), releaseLock: vi.fn() };
        const response = { ok: true, status: 200, statusText: "OK", body: { getReader: () => reader } } as unknown as Response;
        vi.stubGlobal("fetch", vi.fn(async () => response));

        const cb = makeCallbacks();
        await streamChatCompletion(messages, config, cb);
        expect(cb.onError).toHaveBeenCalledWith("LLM stream interrupted: read failed");
        expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    });

    it("reports a non-Error thrown while reading the stream", async () => {
        const reader = { read: vi.fn(async () => { throw "kaput"; }), releaseLock: vi.fn() };
        const response = { ok: true, status: 200, statusText: "OK", body: { getReader: () => reader } } as unknown as Response;
        vi.stubGlobal("fetch", vi.fn(async () => response));

        const cb = makeCallbacks();
        await streamChatCompletion(messages, config, cb);
        expect(cb.onError).toHaveBeenCalledWith("LLM stream interrupted: kaput");
    });

    it("passes the abort signal through to fetch", async () => {
        const fetchMock = vi.fn(async () => makeStreamResponse([]));
        vi.stubGlobal("fetch", fetchMock);
        const controller = new AbortController();

        const cb = makeCallbacks();
        await streamChatCompletion(messages, config, cb, controller.signal);
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(init.signal).toBe(controller.signal);
    });
});
