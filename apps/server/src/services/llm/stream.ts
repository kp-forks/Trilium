/**
 * Shared streaming utilities for converting AI SDK streams to SSE chunks.
 */

import type { LlmStreamChunk } from "@triliumnext/commons";
import type { StreamResult } from "./types.js";

/**
 * Convert an AI SDK StreamResult to an async iterable of LlmStreamChunk.
 * This is provider-agnostic - works with any AI SDK provider.
 */
export async function* streamToChunks(result: StreamResult): AsyncIterable<LlmStreamChunk> {
    try {
        for await (const part of result.fullStream) {
            switch (part.type) {
                case "text-delta":
                    yield { type: "text", content: part.text };
                    break;

                case "reasoning-delta":
                    yield { type: "thinking", content: part.text };
                    break;

                case "tool-call":
                    yield {
                        type: "tool_use",
                        toolName: part.toolName,
                        toolInput: part.input as Record<string, unknown>
                    };
                    break;

                case "tool-result":
                    yield {
                        type: "tool_result",
                        toolName: part.toolName,
                        result: typeof part.output === "string"
                            ? part.output
                            : JSON.stringify(part.output)
                    };
                    break;

                case "source":
                    // Citation from web search (only URL sources have url property)
                    if (part.sourceType === "url") {
                        yield {
                            type: "citation",
                            citation: {
                                url: part.url,
                                title: part.title
                            }
                        };
                    }
                    break;

                case "error":
                    yield { type: "error", error: String(part.error) };
                    break;
            }
        }

        yield { type: "done" };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        yield { type: "error", error: message };
    }
}
