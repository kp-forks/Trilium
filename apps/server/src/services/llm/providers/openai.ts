import { createOpenAI, type OpenAIProvider as OpenAISDKProvider } from "@ai-sdk/openai";
import { generateText, streamText, stepCountIs, type CoreMessage, type ToolSet } from "ai";
import type { LlmMessage } from "@triliumnext/commons";

import becca from "../../../becca/becca.js";
import { getSkillsSummary } from "../skills/index.js";
import { noteTools, attributeTools, hierarchyTools, skillTools, currentNoteTools } from "../tools/index.js";
import type { LlmProvider, LlmProviderConfig, ModelInfo, ModelPricing, StreamResult } from "../types.js";

const DEFAULT_MODEL = "gpt-4.1";
const DEFAULT_MAX_TOKENS = 8096;
const TITLE_MODEL = "gpt-4.1-mini";
const TITLE_MAX_TOKENS = 30;

/**
 * Calculate effective cost for comparison (weighted average: 1 input + 3 output).
 */
function effectiveCost(pricing: ModelPricing): number {
    return (pricing.input + 3 * pricing.output) / 4;
}

/**
 * Available OpenAI models with pricing (USD per million tokens).
 * Source: https://platform.openai.com/docs/pricing
 */
const BASE_MODELS: Omit<ModelInfo, "costMultiplier">[] = [
    // ===== Current Models =====
    {
        id: "gpt-4.1",
        name: "GPT-4.1",
        pricing: { input: 2, output: 8 },
        contextWindow: 1047576,
        isDefault: true
    },
    {
        id: "gpt-4.1-mini",
        name: "GPT-4.1 Mini",
        pricing: { input: 0.4, output: 1.6 },
        contextWindow: 1047576
    },
    {
        id: "gpt-4.1-nano",
        name: "GPT-4.1 Nano",
        pricing: { input: 0.1, output: 0.4 },
        contextWindow: 1047576
    },
    {
        id: "o3",
        name: "o3",
        pricing: { input: 2, output: 8 },
        contextWindow: 200000
    },
    {
        id: "o4-mini",
        name: "o4-mini",
        pricing: { input: 1.1, output: 4.4 },
        contextWindow: 200000
    },
    // ===== Legacy Models =====
    {
        id: "gpt-4o",
        name: "GPT-4o",
        pricing: { input: 2.5, output: 10 },
        contextWindow: 128000,
        isLegacy: true
    },
    {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        pricing: { input: 0.15, output: 0.6 },
        contextWindow: 128000,
        isLegacy: true
    }
];

const baselineModel = BASE_MODELS.find(m => m.isDefault) || BASE_MODELS[0];
const baselineCost = effectiveCost(baselineModel.pricing);

const AVAILABLE_MODELS: ModelInfo[] = BASE_MODELS.map(m => ({
    ...m,
    costMultiplier: Math.round((effectiveCost(m.pricing) / baselineCost) * 10) / 10
}));

const MODEL_PRICING: Record<string, ModelPricing> = Object.fromEntries(
    AVAILABLE_MODELS.map(m => [m.id, m.pricing])
);

/**
 * Build a lightweight context hint about the current note.
 */
function buildNoteHint(noteId: string): string | null {
    const note = becca.getNote(noteId);
    if (!note) {
        return null;
    }

    return `The user is currently viewing a ${note.type} note titled "${note.title}". Use the get_current_note tool to read its content if needed.`;
}

export class OpenAiProvider implements LlmProvider {
    name = "openai";
    private openai: OpenAISDKProvider;

    constructor(apiKey: string) {
        if (!apiKey) {
            throw new Error("API key is required for OpenAI provider");
        }
        this.openai = createOpenAI({ apiKey });
    }

    chat(messages: LlmMessage[], config: LlmProviderConfig): StreamResult {
        let systemPrompt = config.systemPrompt || messages.find(m => m.role === "system")?.content;
        const chatMessages = messages.filter(m => m.role !== "system");

        // Add a lightweight hint about the current note
        if (config.contextNoteId) {
            const noteHint = buildNoteHint(config.contextNoteId);
            if (noteHint) {
                systemPrompt = systemPrompt
                    ? `${systemPrompt}\n\n${noteHint}`
                    : noteHint;
            }
        }

        // Add skills hint
        if (config.enableNoteTools) {
            const skillsHint = `You have access to skills that provide specialized instructions. Load a skill with the load_skill tool before performing complex operations.\n\nAvailable skills:\n${getSkillsSummary()}`;
            systemPrompt = systemPrompt
                ? `${systemPrompt}\n\n${skillsHint}`
                : skillsHint;
        }

        const coreMessages: CoreMessage[] = [];

        if (systemPrompt) {
            coreMessages.push({
                role: "system",
                content: systemPrompt
            });
        }

        for (const m of chatMessages) {
            coreMessages.push({
                role: m.role as "user" | "assistant",
                content: m.content
            });
        }

        const model = this.openai(config.model || DEFAULT_MODEL);

        const streamOptions: Parameters<typeof streamText>[0] = {
            model,
            messages: coreMessages,
            maxOutputTokens: config.maxTokens || DEFAULT_MAX_TOKENS
        };

        // Build tools object
        const tools: ToolSet = {};

        if (config.contextNoteId) {
            Object.assign(tools, currentNoteTools(config.contextNoteId));
        }

        if (config.enableNoteTools) {
            Object.assign(tools, noteTools);
            Object.assign(tools, attributeTools);
            Object.assign(tools, hierarchyTools);
            Object.assign(tools, skillTools);
        }

        if (Object.keys(tools).length > 0) {
            streamOptions.tools = tools;
            streamOptions.stopWhen = stepCountIs(5);
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
            model: this.openai(TITLE_MODEL),
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
