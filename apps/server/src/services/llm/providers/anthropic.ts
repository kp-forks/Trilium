import { createAnthropic, type AnthropicProvider as AnthropicSDKProvider } from "@ai-sdk/anthropic";
import { generateText, streamText, stepCountIs, type CoreMessage, type ToolSet } from "ai";
import type { LlmMessage } from "@triliumnext/commons";

import becca from "../../../becca/becca.js";
import { noteTools, attributeTools, currentNoteTools } from "../tools/index.js";
import type { LlmProvider, LlmProviderConfig, ModelInfo, ModelPricing, StreamResult } from "../types.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 8096;
const TITLE_MODEL = "claude-haiku-4-5-20251001";
const TITLE_MAX_TOKENS = 30;

/**
 * Calculate effective cost for comparison (weighted average: 1 input + 3 output).
 * Output is weighted more heavily as it's typically the dominant cost factor.
 */
function effectiveCost(pricing: ModelPricing): number {
    return (pricing.input + 3 * pricing.output) / 4;
}

/**
 * Available Anthropic models with pricing (USD per million tokens).
 * Source: https://docs.anthropic.com/en/docs/about-claude/models
 */
const BASE_MODELS: Omit<ModelInfo, "costMultiplier">[] = [
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
        contextWindow: 200000, // 1M available with beta header
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
        contextWindow: 200000, // 1M available with beta header
        isLegacy: true
    },
    {
        id: "claude-opus-4-20250514",
        name: "Claude Opus 4.0",
        pricing: { input: 15, output: 75 },
        contextWindow: 200000,
        isLegacy: true
    }
];

// Use default model (Sonnet) as baseline for cost multiplier
const baselineModel = BASE_MODELS.find(m => m.isDefault) || BASE_MODELS[0];
const baselineCost = effectiveCost(baselineModel.pricing);

// Build models with cost multipliers
const AVAILABLE_MODELS: ModelInfo[] = BASE_MODELS.map(m => ({
    ...m,
    costMultiplier: Math.round((effectiveCost(m.pricing) / baselineCost) * 10) / 10
}));

// Build pricing lookup from available models
const MODEL_PRICING: Record<string, ModelPricing> = Object.fromEntries(
    AVAILABLE_MODELS.map(m => [m.id, m.pricing])
);

/**
 * Build a lightweight context hint about the current note (title + type only, no content).
 * The full content is available via the get_current_note tool.
 */
function buildNoteHint(noteId: string): string | null {
    const note = becca.getNote(noteId);
    if (!note) {
        return null;
    }

    return `The user is currently viewing a ${note.type} note titled "${note.title}". Use the get_current_note tool to read its content if needed.`;
}

export class AnthropicProvider implements LlmProvider {
    name = "anthropic";
    private anthropic: AnthropicSDKProvider;

    constructor(apiKey: string) {
        if (!apiKey) {
            throw new Error("API key is required for Anthropic provider");
        }
        this.anthropic = createAnthropic({ apiKey });
    }

    chat(messages: LlmMessage[], config: LlmProviderConfig): StreamResult {
        let systemPrompt = config.systemPrompt || messages.find(m => m.role === "system")?.content;
        const chatMessages = messages.filter(m => m.role !== "system");

        // Add a lightweight hint about the current note (content available via tool)
        if (config.contextNoteId) {
            const noteHint = buildNoteHint(config.contextNoteId);
            if (noteHint) {
                systemPrompt = systemPrompt
                    ? `${systemPrompt}\n\n${noteHint}`
                    : noteHint;
            }
        }

        // Convert to AI SDK message format with cache control breakpoints.
        // The system prompt and conversation history (all but the last user message)
        // are stable across turns, so we mark them for caching to reduce costs.
        const CACHE_CONTROL = { anthropic: { cacheControl: { type: "ephemeral" as const } } };

        const coreMessages: CoreMessage[] = [];

        // System prompt as a cacheable message
        if (systemPrompt) {
            coreMessages.push({
                role: "system",
                content: systemPrompt,
                providerOptions: CACHE_CONTROL
            });
        }

        // Conversation messages
        for (let i = 0; i < chatMessages.length; i++) {
            const m = chatMessages[i];
            const isLastBeforeNewTurn = i === chatMessages.length - 2;
            coreMessages.push({
                role: m.role as "user" | "assistant",
                content: m.content,
                // Cache breakpoint on the second-to-last message:
                // everything up to here is identical across consecutive turns.
                ...(isLastBeforeNewTurn && { providerOptions: CACHE_CONTROL })
            });
        }

        const model = this.anthropic(config.model || DEFAULT_MODEL);

        // Build options for streamText
        const streamOptions: Parameters<typeof streamText>[0] = {
            model,
            messages: coreMessages,
            maxOutputTokens: config.maxTokens || DEFAULT_MAX_TOKENS
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
        const tools: ToolSet = {};

        if (config.enableWebSearch) {
            tools.web_search = this.anthropic.tools.webSearch_20250305({
                maxUses: 5
            });
        }

        if (config.contextNoteId) {
            Object.assign(tools, currentNoteTools(config.contextNoteId));
        }

        if (config.enableNoteTools) {
            Object.assign(tools, noteTools);
            Object.assign(tools, attributeTools);
        }

        if (Object.keys(tools).length > 0) {
            streamOptions.tools = tools;
            // Allow multiple tool use cycles before final response
            streamOptions.stopWhen = stepCountIs(5);
            // Let model decide when to use tools vs respond with text
            streamOptions.toolChoice = "auto";
        }

        return streamText(streamOptions);
    }

    getModelPricing(model: string): ModelPricing | undefined {
        return MODEL_PRICING[model];
    }

    getAvailableModels(): ModelInfo[] {
        return AVAILABLE_MODELS;
    }

    async generateTitle(firstMessage: string): Promise<string> {
        const { text } = await generateText({
            model: this.anthropic(TITLE_MODEL),
            maxOutputTokens: TITLE_MAX_TOKENS,
            messages: [
                {
                    role: "user",
                    content: `Summarize the following message as a very short chat title (max 6 words). Reply with ONLY the title, no quotes or punctuation at the end.\n\nMessage: ${firstMessage}`
                }
            ]
        });

        return text.trim();
    }
}
