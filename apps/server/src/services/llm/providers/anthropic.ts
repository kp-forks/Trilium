import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, LlmMessage, LlmStreamChunk, LlmProviderConfig } from "../types.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 4096;

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

        try {
            const stream = this.client.messages.stream({
                model: config.model || DEFAULT_MODEL,
                max_tokens: config.maxTokens || DEFAULT_MAX_TOKENS,
                system: systemPrompt,
                messages: chatMessages.map(m => ({
                    role: m.role as "user" | "assistant",
                    content: m.content
                }))
            });

            for await (const event of stream) {
                if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                    yield { type: "text", content: event.delta.text };
                }
            }

            yield { type: "done" };
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            yield { type: "error", error: message };
        }
    }
}
