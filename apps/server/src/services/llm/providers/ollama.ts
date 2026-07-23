/**
 * Ollama provider — chats through the OpenAI-compatible API that Ollama exposes
 * at `/v1`, but lists models through Ollama's own `/api/tags`, which reports the
 * parameter size and quantization level the OpenAI-compatible `/models`
 * endpoint omits.
 *
 * Everything about an Ollama instance is dynamic: the models are whatever the
 * user has pulled locally, and none of them appear in the committed price table
 * — they run on the user's own hardware, so they are free.
 */

import { createOpenAI, type OpenAIProvider as OpenAISDKProvider } from "@ai-sdk/openai";
import { getLog } from "@triliumnext/core";

import type { ModelInfo, ModelPricing } from "../types.js";
import { BaseProvider, type RemoteModel } from "./base_provider.js";

const DEFAULT_BASE_URL = "http://localhost:11434";

/** Ollama models run locally, so they cost nothing to use. */
const FREE_PRICING: ModelPricing = { input: 0, output: 0 };

/** Below this parameter count (in billions) a model is cheap enough for titles. */
const TITLE_MODEL_MAX_PARAMS_B = 4;

/**
 * Shape of the Ollama `/api/tags` response.
 * See https://github.com/ollama/ollama/blob/main/docs/api.md#list-local-models
 */
interface OllamaTagsResponse {
    models: Array<{
        name: string;
        model: string;
        modified_at?: string;
        size?: number;
        digest?: string;
        details?: {
            parent_model?: string;
            format?: string;
            family?: string;
            families?: string[];
            parameter_size?: string;
            quantization_level?: string;
        };
    }>;
}

type OllamaTag = OllamaTagsResponse["models"][number];

export class OllamaProvider extends BaseProvider {
    name = "ollama";
    // Both are resolved from the live model list — an Ollama instance serves
    // whatever the user pulled, so there is nothing sensible to hardcode.
    protected defaultModel = "";
    protected titleModel = "";

    private openai: OpenAISDKProvider;
    /** Validated instance URL, without a trailing slash. */
    private endpoint: string;

    constructor(apiKey = "", baseURL?: string) {
        super(apiKey, baseURL);
        this.endpoint = sanitizeBaseUrl(this.baseURL);

        // Ollama exposes an OpenAI-compatible endpoint at /v1
        this.openai = createOpenAI({
            apiKey: apiKey || "ollama", // Ollama ignores this but the SDK requires it
            baseURL: `${this.endpoint}/v1`
        });
    }

    protected createModel(modelId: string) {
        // Use the Chat Completions API explicitly — calling `this.openai(modelId)`
        // defaults to the OpenAI Responses API, which Ollama only supports
        // since 0.13.3. Chat Completions works on all Ollama versions.
        return this.openai.chat(modelId);
    }

    /**
     * List the models installed on the instance. Uses Ollama's native
     * `/api/tags` rather than the OpenAI-compatible `/models`: only the former
     * carries the parameter size and quantization level shown in the picker and
     * used to pick a cheap title model.
     */
    protected override async fetchRemoteModels(): Promise<RemoteModel[] | null> {
        const payload = await this.fetchJson(`${this.endpoint}/api/tags`, {});
        const models = (payload as OllamaTagsResponse).models;
        if (!Array.isArray(models)) {
            throw new Error("Unexpected /api/tags response shape");
        }
        this.pickModelDefaults(models);
        return models.map(m => ({ id: m.name, name: formatModelName(m) }));
    }

    /**
     * Ollama models never appear in the committed price table (they are local
     * builds, not a vendor catalog), so tag the merged list as free rather than
     * leaving the cost unknown in the picker.
     */
    override async listModels(): Promise<ModelInfo[]> {
        const models = await super.listModels();
        return models.map(model => ({ ...model, pricing: FREE_PRICING }));
    }

    /** Running a model locally is free, whatever the price table knows. */
    override getModelPricing(): ModelPricing {
        return FREE_PRICING;
    }

    /**
     * The title model is only known once the instance has been listed, so make
     * sure that happened before falling through to the base implementation
     * (which chats with {@link titleModel}). The list is cached by the base
     * class, so this is a no-op after the first call.
     */
    override async generateTitle(firstMessage: string): Promise<string> {
        if (!this.titleModel) {
            await this.listModels();
        }
        return super.generateTitle(firstMessage);
    }

    /**
     * Remember which model to chat with by default and which to write chat
     * titles with. Ollama has no notion of a default, so the first installed
     * model wins; titles prefer the smallest model available, since they are a
     * throwaway one-liner and a 70B model would make opening a chat sluggish.
     */
    private pickModelDefaults(models: OllamaTag[]): void {
        if (models.length === 0) {
            return;
        }
        this.defaultModel = models[0].name;
        const smallModel = models.find(m => {
            const size = parseParamSize(m.details?.parameter_size);
            return size !== undefined && size < TITLE_MODEL_MAX_PARAMS_B;
        }) ?? models.find(m => /small|mini|tiny|phi|gemma.*2b/i.test(m.name));
        this.titleModel = smallModel?.name ?? this.defaultModel;
    }
}

/**
 * Validate a user-supplied base URL: must parse as an http(s) URL.
 * Falls back to the default local instance URL otherwise.
 */
function sanitizeBaseUrl(baseUrl: string | undefined): string {
    if (!baseUrl) {
        return DEFAULT_BASE_URL;
    }
    try {
        const parsed = new URL(baseUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            throw new Error(`unsupported protocol ${parsed.protocol}`);
        }
        return baseUrl;
    } catch (e) {
        getLog().error(`Ollama: invalid base URL "${baseUrl}" (${e}), falling back to ${DEFAULT_BASE_URL}`);
        return DEFAULT_BASE_URL;
    }
}

/**
 * Parse a parameter_size string like "7.6B" or "3.2B" into a number of billions.
 * Returns undefined if the string cannot be parsed.
 */
function parseParamSize(paramSize?: string): number | undefined {
    if (!paramSize) return undefined;
    const match = paramSize.match(/^([\d.]+)\s*([BMK])/i);
    if (!match) return undefined;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit === "B") return value;
    if (unit === "M") return value / 1000;
    if (unit === "K") return value / 1_000_000;
    return undefined;
}

/**
 * Build a human-readable display name from Ollama model metadata.
 * Example: "llama3.2:latest" → "llama3.2:latest (3.2B, Q4_K_M)"
 */
function formatModelName(m: OllamaTag): string {
    const parts: string[] = [];
    if (m.details?.parameter_size) {
        parts.push(m.details.parameter_size);
    }
    if (m.details?.quantization_level) {
        parts.push(m.details.quantization_level);
    }
    if (parts.length > 0) {
        return `${m.name} (${parts.join(", ")})`;
    }
    return m.name;
}
