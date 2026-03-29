import { anthropic } from "@ai-sdk/anthropic";
import { streamText, type CoreMessage } from "ai";
import type { LlmMessage, LlmStreamChunk } from "@triliumnext/commons";

import type { LlmProvider, LlmProviderConfig } from "../types.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 8096;

export class AnthropicProvider implements LlmProvider {
    name = "anthropic";

    constructor() {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error("ANTHROPIC_API_KEY environment variable is required");
        }
        // The anthropic provider reads ANTHROPIC_API_KEY from env automatically
    }

    async *streamCompletion(
        messages: LlmMessage[],
        config: LlmProviderConfig
    ): AsyncIterable<LlmStreamChunk> {
        const systemPrompt = config.systemPrompt || messages.find(m => m.role === "system")?.content;
        const chatMessages = messages.filter(m => m.role !== "system");

        // Convert to AI SDK message format
        const coreMessages: CoreMessage[] = chatMessages.map(m => ({
            role: m.role as "user" | "assistant",
            content: m.content
        }));

        try {
            const model = anthropic(config.model || DEFAULT_MODEL);

            // Build options for streamText
            const streamOptions: Parameters<typeof streamText>[0] = {
                model,
                messages: coreMessages,
                maxOutputTokens: config.maxTokens || DEFAULT_MAX_TOKENS,
                system: systemPrompt
            };

            // Enable extended thinking for deeper reasoning
            if (config.enableExtendedThinking) {
                const thinkingBudget = config.thinkingBudget || 10000;
                // Vercel AI SDK handles thinking via providerOptions
                streamOptions.providerOptions = {
                    anthropic: {
                        thinking: {
                            type: "enabled",
                            budgetTokens: thinkingBudget
                        }
                    }
                };
                // Ensure max tokens accommodates thinking budget
                streamOptions.maxOutputTokens = Math.max(
                    streamOptions.maxOutputTokens || DEFAULT_MAX_TOKENS,
                    thinkingBudget + 4000
                );
                console.log(`[LLM] Extended thinking enabled with budget: ${thinkingBudget} tokens`);
            }

            // Enable web search if configured
            if (config.enableWebSearch) {
                const webSearchTool = anthropic.tools.webSearch_20250305({
                    maxUses: 5
                });
                streamOptions.tools = {
                    web_search: webSearchTool
                };
            }

            const result = streamText(streamOptions);

            // Stream the response
            for await (const part of result.fullStream) {
                switch (part.type) {
                    case "text-delta":
                        yield { type: "text", content: part.text };
                        break;

                    case "reasoning-delta":
                        // Extended thinking content
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

                    case "finish":
                        // Stream finished
                        break;
                }
            }

            yield { type: "done" };
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            yield { type: "error", error: message };
        }
    }
}
