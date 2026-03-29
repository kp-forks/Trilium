/**
 * Shared streaming utilities for converting AI SDK streams to SSE chunks.
 */

import type { LlmStreamChunk } from "@triliumnext/commons";

import type { StreamResult } from "./types.js";

/**
 * Pricing per million tokens for known models.
 * Prices in USD as of 2024.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    // Claude Sonnet 4
    "claude-sonnet-4-20250514": { input: 3, output: 15 },
    // Claude Opus 4
    "claude-opus-4-20250514": { input: 15, output: 75 },
    // Claude Haiku 3.5
    "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
    "claude-3-5-haiku-latest": { input: 0.8, output: 4 },
    // Claude Sonnet 3.5
    "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
    "claude-3-5-sonnet-latest": { input: 3, output: 15 },
};

/**
 * Calculate estimated cost in USD based on token usage and model.
 */
function calculateCost(inputTokens: number, outputTokens: number, model?: string): number | undefined {
    if (!model) return undefined;

    const pricing = MODEL_PRICING[model];
    if (!pricing) return undefined;

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
}

export interface StreamOptions {
    /** Model identifier for cost calculation */
    model?: string;
}

/**
 * Convert an AI SDK StreamResult to an async iterable of LlmStreamChunk.
 * This is provider-agnostic - works with any AI SDK provider.
 */
export async function* streamToChunks(result: StreamResult, options: StreamOptions = {}): AsyncIterable<LlmStreamChunk> {
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

        // Get usage information after stream completes
        const usage = await result.usage;
        if (usage && typeof usage.inputTokens === "number" && typeof usage.outputTokens === "number") {
            const cost = calculateCost(usage.inputTokens, usage.outputTokens, options.model);
            yield {
                type: "usage",
                usage: {
                    promptTokens: usage.inputTokens,
                    completionTokens: usage.outputTokens,
                    totalTokens: usage.inputTokens + usage.outputTokens,
                    cost
                }
            };
        }

        yield { type: "done" };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        yield { type: "error", error: message };
    }
}
