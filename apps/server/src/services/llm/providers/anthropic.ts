import Anthropic from "@anthropic-ai/sdk";
import type { LlmMessage, LlmStreamChunk } from "@triliumnext/commons";

import type { LlmProvider, LlmProviderConfig } from "../types.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 8096;

/**
 * Server-side web search tool type.
 * Not yet in SDK types as of @anthropic-ai/sdk.
 */
interface WebSearchTool {
    type: "web_search_20250305";
    name: "web_search";
    max_uses?: number;
}

export class AnthropicProvider implements LlmProvider {
    name = "anthropic";
    private client: Anthropic;

    constructor() {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error("ANTHROPIC_API_KEY environment variable is required");
        }
        this.client = new Anthropic({ apiKey });
    }

    async *streamCompletion(
        messages: LlmMessage[],
        config: LlmProviderConfig
    ): AsyncIterable<LlmStreamChunk> {
        const systemPrompt = config.systemPrompt || messages.find(m => m.role === "system")?.content;
        const chatMessages = messages.filter(m => m.role !== "system");

        // Build tools array
        // Using union with WebSearchTool since it's not in SDK types yet
        const tools: (Anthropic.ToolUnion | WebSearchTool)[] = [];
        if (config.enableWebSearch) {
            tools.push({
                type: "web_search_20250305",
                name: "web_search",
                max_uses: 5 // Limit searches per request
            } satisfies WebSearchTool);
        }

        try {
            const streamParams: Anthropic.Messages.MessageStreamParams = {
                model: config.model || DEFAULT_MODEL,
                max_tokens: config.maxTokens || DEFAULT_MAX_TOKENS,
                system: systemPrompt,
                messages: chatMessages.map(m => ({
                    role: m.role as "user" | "assistant",
                    content: m.content
                }))
            };

            if (tools.length > 0) {
                // Cast needed until SDK adds WebSearchTool type
                streamParams.tools = tools as Anthropic.ToolUnion[];
            }

            // Enable extended thinking for deeper reasoning
            if (config.enableExtendedThinking) {
                const thinkingBudget = config.thinkingBudget || 10000;
                // max_tokens must be greater than thinking budget
                streamParams.max_tokens = Math.max(streamParams.max_tokens, thinkingBudget + 4000);
                streamParams.thinking = {
                    type: "enabled",
                    budget_tokens: thinkingBudget
                };
                console.log(`[LLM] Extended thinking enabled with budget: ${thinkingBudget} tokens`);
            }

            const stream = this.client.messages.stream(streamParams);

            for await (const event of stream) {
                // Handle different event types
                if (event.type === "content_block_start") {
                    const block = event.content_block;
                    if (block.type === "tool_use") {
                        yield {
                            type: "tool_use",
                            toolName: block.name,
                            toolInput: {} // Input comes in deltas
                        };
                    } else if (block.type === "thinking") {
                        console.log("[LLM] Thinking block started");
                    }
                } else if (event.type === "content_block_delta") {
                    const delta = event.delta;
                    if (delta.type === "text_delta") {
                        yield { type: "text", content: delta.text };
                    } else if (delta.type === "thinking_delta") {
                        yield { type: "thinking", content: delta.thinking };
                    } else if (delta.type === "input_json_delta") {
                        // Tool input is being streamed - we could accumulate it
                        // For now, we already emitted tool_use at start
                    }
                } else if (event.type === "content_block_stop") {
                    // Content block finished
                    // For server-side tools, results come in subsequent blocks
                }

                // Handle server-side tool results (for web_search)
                // These appear as special content blocks in the response
                if (event.type === "message_delta") {
                    // Check for citations in stop_reason or other metadata
                }
            }

            // Get the final message to extract any citations
            const finalMessage = await stream.finalMessage();
            for (const block of finalMessage.content) {
                if (block.type === "text" && block.citations) {
                    for (const citation of block.citations) {
                        // Extract citation info from SDK types (CitationCharLocation, etc.)
                        // These have: cited_text, document_index, document_title
                        // Web search citations may have additional properties at runtime
                        const citationData = citation as unknown as Record<string, unknown>;
                        yield {
                            type: "citation",
                            citation: {
                                title: citation.document_title ?? undefined,
                                citedText: citation.cited_text,
                                // URL may be present for web search results (not in SDK types yet)
                                url: typeof citationData.url === "string" ? citationData.url : undefined
                            }
                        };
                    }
                }
            }

            yield { type: "done" };
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            yield { type: "error", error: message };
        }
    }
}
