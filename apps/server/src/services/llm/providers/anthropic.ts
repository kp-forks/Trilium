import { anthropic } from "@ai-sdk/anthropic";
import { streamText, stepCountIs, type CoreMessage } from "ai";
import type { LlmMessage } from "@triliumnext/commons";

import { noteTools } from "../tools.js";
import type { LlmProvider, LlmProviderConfig, ModelPricing, StreamResult } from "../types.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 8096;

/**
 * Pricing per million tokens for Anthropic models (USD).
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
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

        // Build tools object
        const tools: Record<string, unknown> = {};

        if (config.enableWebSearch) {
            tools.web_search = anthropic.tools.webSearch_20250305({
                maxUses: 5
            });
        }

        if (config.enableNoteTools) {
            Object.assign(tools, noteTools);
        }

        if (Object.keys(tools).length > 0) {
            streamOptions.tools = tools;
            // Allow multiple tool use cycles before final response
            streamOptions.maxSteps = 5;
            // Override default stopWhen which stops after 1 step
            streamOptions.stopWhen = stepCountIs(5);
            // Let model decide when to use tools vs respond with text
            streamOptions.toolChoice = "auto";
        }

        return streamText(streamOptions);
    }

    getModelPricing(model: string): ModelPricing | undefined {
        return MODEL_PRICING[model];
    }
}
