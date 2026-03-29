import { anthropic } from "@ai-sdk/anthropic";
import { streamText, type CoreMessage } from "ai";
import type { LlmMessage } from "@triliumnext/commons";

import type { LlmProvider, LlmProviderConfig, StreamResult } from "../types.js";

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

    chat(messages: LlmMessage[], config: LlmProviderConfig): StreamResult {
        const systemPrompt = config.systemPrompt || messages.find(m => m.role === "system")?.content;
        const chatMessages = messages.filter(m => m.role !== "system");

        // Convert to AI SDK message format
        const coreMessages: CoreMessage[] = chatMessages.map(m => ({
            role: m.role as "user" | "assistant",
            content: m.content
        }));

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
            streamOptions.providerOptions = {
                anthropic: {
                    thinking: {
                        type: "enabled",
                        budgetTokens: thinkingBudget
                    }
                }
            };
            streamOptions.maxOutputTokens = Math.max(
                streamOptions.maxOutputTokens || DEFAULT_MAX_TOKENS,
                thinkingBudget + 4000
            );
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

        return streamText(streamOptions);
    }
}
