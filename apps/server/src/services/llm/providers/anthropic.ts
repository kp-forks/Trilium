import { createAnthropic, type AnthropicProvider as AnthropicSDKProvider } from "@ai-sdk/anthropic";
import { stepCountIs, streamText, type CoreMessage, type ToolSet } from "ai";
import type { LlmMessage } from "@triliumnext/commons";

import type { LlmProviderConfig, StreamResult } from "../types.js";
import { BaseProvider, buildModelList } from "./base_provider.js";

/**
 * Available Anthropic models with pricing (USD per million tokens).
 * Source: https://docs.anthropic.com/en/docs/about-claude/models
 */
const { models: AVAILABLE_MODELS, pricing: MODEL_PRICING } = buildModelList([
    // ===== Current Models =====
    {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        pricing: { input: 3, output: 15 },
        contextWindow: 1000000,
        isDefault: true
    },
    {
        id: "claude-opus-4-6",
        name: "Claude Opus 4.6",
        pricing: { input: 5, output: 25 },
        contextWindow: 1000000
    },
    {
        id: "claude-haiku-4-5-20251001",
        name: "Claude Haiku 4.5",
        pricing: { input: 1, output: 5 },
        contextWindow: 200000
    },
    // ===== Legacy Models =====
    {
        id: "claude-sonnet-4-5-20250929",
        name: "Claude Sonnet 4.5",
        pricing: { input: 3, output: 15 },
        contextWindow: 200000,
        isLegacy: true
    },
    {
        id: "claude-opus-4-5-20251101",
        name: "Claude Opus 4.5",
        pricing: { input: 5, output: 25 },
        contextWindow: 200000,
        isLegacy: true
    },
    {
        id: "claude-opus-4-1-20250805",
        name: "Claude Opus 4.1",
        pricing: { input: 15, output: 75 },
        contextWindow: 200000,
        isLegacy: true
    },
    {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4.0",
        pricing: { input: 3, output: 15 },
        contextWindow: 200000,
        isLegacy: true
    },
    {
        id: "claude-opus-4-20250514",
        name: "Claude Opus 4.0",
        pricing: { input: 15, output: 75 },
        contextWindow: 200000,
        isLegacy: true
    }
]);

export class AnthropicProvider extends BaseProvider {
    name = "anthropic";
    protected defaultModel = "claude-sonnet-4-6";
    protected titleModel = "claude-haiku-4-5-20251001";
    protected availableModels = AVAILABLE_MODELS;
    protected modelPricing = MODEL_PRICING;

    private anthropic: AnthropicSDKProvider;

    constructor(apiKey: string) {
        super();
        if (!apiKey) {
            throw new Error("API key is required for Anthropic provider");
        }
        this.anthropic = createAnthropic({ apiKey });
    }

    protected createModel(modelId: string) {
        return this.anthropic(modelId);
    }

    /**
     * Override chat to add Anthropic-specific features:
     * - Prompt caching via providerOptions
     * - Extended thinking
     * - Web search tool
     */
    override chat(messages: LlmMessage[], config: LlmProviderConfig): StreamResult {
        const systemPrompt = this.buildSystemPrompt(messages, config);
        const chatMessages = messages.filter(m => m.role !== "system");

        // Anthropic-specific: cache control breakpoints on system prompt and conversation history
        const CACHE_CONTROL = { anthropic: { cacheControl: { type: "ephemeral" as const } } };

        const coreMessages: CoreMessage[] = [];

        if (systemPrompt) {
            coreMessages.push({
                role: "system",
                content: systemPrompt,
                providerOptions: CACHE_CONTROL
            });
        }

        for (let i = 0; i < chatMessages.length; i++) {
            const m = chatMessages[i];
            const isLastBeforeNewTurn = i === chatMessages.length - 2;
            coreMessages.push({
                role: m.role as "user" | "assistant",
                content: m.content,
                ...(isLastBeforeNewTurn && { providerOptions: CACHE_CONTROL })
            });
        }

        const streamOptions: Parameters<typeof streamText>[0] = {
            model: this.createModel(config.model || this.defaultModel),
            messages: coreMessages,
            maxOutputTokens: config.maxTokens || 8096
        };

        // Anthropic-specific: extended thinking
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
                streamOptions.maxOutputTokens || 8096,
                thinkingBudget + 4000
            );
        }

        // Build tools (shared + Anthropic-specific web search)
        const tools: ToolSet = this.buildTools(config);

        if (config.enableWebSearch) {
            tools.web_search = this.anthropic.tools.webSearch_20250305({
                maxUses: 5
            });
        }

        if (Object.keys(tools).length > 0) {
            streamOptions.tools = tools;
            streamOptions.stopWhen = stepCountIs(5);
            streamOptions.toolChoice = "auto";
        }

        return streamText(streamOptions);
    }
}
