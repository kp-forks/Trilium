import type { LlmStreamChunk } from "@triliumnext/commons";
import { APICallError } from "ai";
import { describe, expect, it } from "vitest";

import { describeStreamError, streamToChunks } from "./stream.js";
import type { StreamResult } from "./types.js";

type ErrorChunk = Extract<LlmStreamChunk, { type: "error" }>;

/** Build a minimal fake StreamResult exposing just what streamToChunks consumes. */
function fakeResult(parts: unknown[], totalUsage: Promise<unknown>): StreamResult {
    return {
        fullStream: (async function* () {
            for (const part of parts) {
                yield part;
            }
        })(),
        totalUsage
    } as unknown as StreamResult;
}

/** Drain streamToChunks into an array. */
async function collect(result: StreamResult): Promise<LlmStreamChunk[]> {
    const chunks: LlmStreamChunk[] = [];
    for await (const chunk of streamToChunks(result)) {
        chunks.push(chunk);
    }
    return chunks;
}

/** A representative provider failure: a 404 against a misconfigured base URL. */
function apiCallError(): APICallError {
    return new APICallError({
        message: "Not Found",
        url: "http://localhost:8080/messages",
        requestBodyValues: {},
        statusCode: 404,
        responseBody: '{"message":"Router not found for request POST /messages"}'
    });
}

/**
 * The AI SDK rejects `result.totalUsage` with this generic message whenever the
 * stream produced no steps — which is exactly what happens after a connection-level error.
 */
function noOutputUsage(): Promise<never> {
    return Promise.reject(new Error("No output generated. Check the stream for errors."));
}

const errorsOf = (chunks: LlmStreamChunk[]) =>
    chunks.filter((c): c is ErrorChunk => c.type === "error");

describe("streamToChunks", () => {
    it("emits text and a final done chunk for a normal stream", async () => {
        const chunks = await collect(fakeResult(
            [
                { type: "text-delta", text: "Hello " },
                { type: "text-delta", text: "world" }
            ],
            Promise.resolve({ inputTokens: 10, outputTokens: 5 })
        ));

        expect(chunks).toEqual([
            { type: "text", content: "Hello " },
            { type: "text", content: "world" },
            {
                type: "usage",
                usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, cost: undefined, model: undefined }
            },
            { type: "done" }
        ]);
    });

    it("does not mask a real stream error with the generic 'No output generated' error", async () => {
        // A genuine error part arrives, then `totalUsage` rejects because no steps ran.
        const chunks = await collect(fakeResult(
            [{ type: "error", error: apiCallError() }],
            noOutputUsage()
        ));

        // The previous implementation emitted two error chunks — the real one, then the
        // generic "No output generated" — so the client only ever saw the masked one.
        const errors = errorsOf(chunks);
        expect(errors).toHaveLength(1);
        expect(errors[0].error).not.toContain("No output generated");
        expect(errors[0].error).toContain("Not Found");
        // No spurious done chunk should follow a failed stream.
        expect(chunks.some(c => c.type === "done")).toBe(false);
    });

    it("includes HTTP status, URL and response body in the surfaced error", async () => {
        const chunks = await collect(fakeResult(
            [{ type: "error", error: apiCallError() }],
            noOutputUsage()
        ));

        const [error] = errorsOf(chunks);
        // The previous implementation used String(error), losing all of this detail.
        expect(error.error).toContain("HTTP 404");
        expect(error.error).toContain("http://localhost:8080/messages");
        expect(error.error).toContain("Router not found");
    });

    it("surfaces a usage rejection when no error part preceded it", async () => {
        const chunks = await collect(fakeResult(
            [{ type: "text-delta", text: "partial" }],
            noOutputUsage()
        ));

        expect(chunks).toContainEqual({ type: "text", content: "partial" });
        expect(errorsOf(chunks)).toHaveLength(1);
        expect(errorsOf(chunks)[0].error).toContain("No output generated");
        expect(chunks.some(c => c.type === "done")).toBe(false);
    });

    it("streams tool input deltas with the same id used by the final tool-call", async () => {
        // The AI SDK emits the JSON arguments incrementally as `tool-input-delta` chunks
        // before the parsed `tool-call` arrives — clients use the shared id to attach
        // each delta to the right pending tool block.
        const chunks = await collect(fakeResult(
            [
                { type: "tool-input-start", id: "call_42", toolName: "search_notes" },
                { type: "tool-input-delta", id: "call_42", delta: "{\"query\":\"" },
                { type: "tool-input-delta", id: "call_42", delta: "trilium\"}" },
                { type: "tool-call", toolCallId: "call_42", toolName: "search_notes", input: { query: "trilium" } },
                { type: "tool-result", toolCallId: "call_42", toolName: "search_notes", output: "[]" }
            ],
            Promise.resolve({ inputTokens: 1, outputTokens: 1 })
        ));

        expect(chunks).toEqual([
            { type: "tool_input_start", toolCallId: "call_42", toolName: "search_notes" },
            { type: "tool_input_delta", toolCallId: "call_42", delta: "{\"query\":\"" },
            { type: "tool_input_delta", toolCallId: "call_42", delta: "trilium\"}" },
            {
                type: "tool_use",
                toolCallId: "call_42",
                toolName: "search_notes",
                toolInput: { query: "trilium" }
            },
            {
                type: "tool_result",
                toolCallId: "call_42",
                toolName: "search_notes",
                result: "[]",
                isError: false
            },
            {
                type: "usage",
                usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, cost: undefined, model: undefined }
            },
            { type: "done" }
        ]);
    });

    it("interleaves input deltas for parallel tool calls and forwards distinct ids", async () => {
        // Two parallel tool calls with the same name; without per-call ids the client
        // couldn't tell whose delta belonged to whom.
        const chunks = await collect(fakeResult(
            [
                { type: "tool-input-start", id: "a", toolName: "search_notes" },
                { type: "tool-input-start", id: "b", toolName: "search_notes" },
                { type: "tool-input-delta", id: "a", delta: "{\"query\":\"x\"}" },
                { type: "tool-input-delta", id: "b", delta: "{\"query\":\"y\"}" },
                { type: "tool-call", toolCallId: "a", toolName: "search_notes", input: { query: "x" } },
                { type: "tool-call", toolCallId: "b", toolName: "search_notes", input: { query: "y" } }
            ],
            Promise.resolve({ inputTokens: 1, outputTokens: 1 })
        ));

        const idsByType = chunks.reduce<Record<string, string[]>>((acc, c) => {
            if ("toolCallId" in c) (acc[c.type] ??= []).push(c.toolCallId);
            return acc;
        }, {});
        expect(idsByType.tool_input_start).toEqual(["a", "b"]);
        expect(idsByType.tool_input_delta).toEqual(["a", "b"]);
        expect(idsByType.tool_use).toEqual(["a", "b"]);
    });
});

describe("describeStreamError", () => {
    it("expands an APICallError into status, URL and response body", () => {
        const msg = describeStreamError(apiCallError());
        expect(msg).toContain("AI_APICallError: Not Found");
        expect(msg).toContain("HTTP 404");
        expect(msg).toContain("URL http://localhost:8080/messages");
        expect(msg).toContain('{"message":"Router not found for request POST /messages"}');
    });

    it("truncates an oversized response body", () => {
        const err = new APICallError({
            message: "Boom",
            url: "http://example.com/api",
            requestBodyValues: {},
            statusCode: 500,
            responseBody: "x".repeat(900)
        });
        const msg = describeStreamError(err);
        expect(msg).toContain("…");
        expect(msg.length).toBeLessThan(900);
    });

    it("falls back to name and message for a plain Error", () => {
        expect(describeStreamError(new TypeError("bad input"))).toBe("TypeError: bad input");
    });

    it("stringifies a non-Error value", () => {
        expect(describeStreamError("just a string")).toBe("just a string");
    });
});
