/**
 * Base class for LLM providers. Handles shared logic for system prompt building,
 * tool assembly, model pricing, and title generation.
 */

import { type LlmMessage, type LlmMessagePart } from "@triliumnext/commons";
import { getLog } from "@triliumnext/core";
import { type FilePart, generateText, type ImagePart, type LanguageModel, type ModelMessage, stepCountIs, streamText, type SystemModelMessage, type TextPart, type ToolSet } from "ai";

import { allToolRegistries } from "../tools/index.js";
import type { LlmProvider, LlmProviderConfig, ModelInfo, ModelPricing, StreamResult } from "../types.js";
import { resolveAttachmentPart } from "./attachment_content.js";
import { mergeModelLists, type RemoteModel } from "./model_listing.js";
import { buildNoteHint } from "./note_hint.js";
import { buildSystemPrompt as composeSystemPrompt } from "./system_prompt.js";

const DEFAULT_MAX_TOKENS = 8096;
const TITLE_MAX_TOKENS = 30;

/** How long a successfully fetched dynamic model list is served from cache. */
const MODEL_LIST_TTL_MS = 60 * 60 * 1000;
/** After a failed fetch, don't retry for this long — avoids re-stalling the UI on a dead endpoint. */
const MODEL_LIST_FAILURE_COOLDOWN_MS = 60 * 1000;
/** Timeout for a single models-endpoint request. */
const MODEL_LIST_TIMEOUT_MS = 10_000;

/**
 * Calculate effective cost for comparison (weighted average: 1 input + 3 output).
 * Output is weighted more heavily as it's typically the dominant cost factor.
 */
function effectiveCost(pricing: ModelPricing): number {
    return (pricing.input + 3 * pricing.output) / 4;
}

/**
 * Resolve a single LlmMessagePart to its AI SDK ModelMessage part form, mapping
 * the provider-neutral {@link resolveAttachmentPart} result into `ai`'s block
 * shapes. Returns null (and the caller drops the part) when it can't resolve.
 */
function resolveMessagePart(part: LlmMessagePart): TextPart | ImagePart | FilePart | null {
    const resolved = resolveAttachmentPart(part);
    if (!resolved) {
        return null;
    }
    switch (resolved.kind) {
        case "text":
            return { type: "text", text: resolved.text };
        case "image":
            return { type: "image", image: resolved.bytes, mediaType: resolved.mime };
        case "file":
            return { type: "file", data: resolved.bytes, mediaType: resolved.mime, filename: resolved.filename };
    }
}

/**
 * Build a single ModelMessage from an LlmMessage. Plain string content stays
 * as-is; multimodal content is resolved into AI SDK text/image/file parts.
 */
export function buildModelMessage(m: LlmMessage): ModelMessage {
    const role = m.role as "user" | "assistant";
    if (typeof m.content === "string") {
        return { role, content: m.content };
    }
    const resolved = m.content
        .map(resolveMessagePart)
        .filter((p): p is TextPart | ImagePart | FilePart => p !== null);
    // Assistant turns can only carry TextParts (per the AI SDK type), so
    // strip any stray attachments — they only make sense on user turns anyway.
    if (role === "assistant") {
        const textOnly: TextPart[] = resolved.filter((p): p is TextPart => p.type === "text");
        return { role: "assistant", content: textOnly };
    }
    return { role: "user", content: resolved };
}

/**
 * A curated (hard-coded) model definition. Unlike dynamically discovered
 * models, curated entries always carry pricing.
 */
type CuratedModel = Omit<ModelInfo, "costMultiplier"> & { pricing: ModelPricing };

/**
 * Build the model list with cost multipliers from a base model definition array.
 */
export function buildModelList(baseModels: CuratedModel[]): {
    models: ModelInfo[];
    pricing: Record<string, ModelPricing>;
} {
    const baselineModel = baseModels.find(m => m.isDefault) || baseModels[0];
    const baselineCost = effectiveCost(baselineModel.pricing);

    const models = baseModels.map(m => ({
        ...m,
        costMultiplier: Math.round((effectiveCost(m.pricing) / baselineCost) * 10) / 10
    }));

    const pricing = Object.fromEntries(
        models.map(m => [m.id, m.pricing])
    );

    return { models, pricing };
}

export abstract class BaseProvider implements LlmProvider {
    abstract name: string;

    protected abstract defaultModel: string;
    protected abstract titleModel: string;
    protected abstract availableModels: ModelInfo[];
    protected abstract modelPricing: Record<string, ModelPricing>;

    protected apiKey: string;
    /** Custom endpoint override (self-hosted Ollama/vLLM, proxies). Normalized without a trailing slash. */
    protected baseURL?: string;

    private modelListCache?: { models: ModelInfo[]; fetchedAt: number };
    private modelListInFlight?: Promise<ModelInfo[]>;
    private modelListFailedAt?: number;

    constructor(apiKey = "", baseURL?: string) {
        this.apiKey = apiKey;
        this.baseURL = baseURL?.replace(/\/+$/, "") || undefined;
    }

    /** Create a language model instance for the given model ID. */
    protected abstract createModel(modelId: string): LanguageModel;

    /**
     * Fetch the raw model list from the provider's models endpoint. Returns
     * null when the provider doesn't support dynamic listing. Overridden by
     * providers that do; errors are handled by {@link listModels}.
     */
    protected async fetchRemoteModels(): Promise<RemoteModel[] | null> {
        return null;
    }

    /**
     * GET a JSON document with the standard model-listing timeout. Shared
     * helper for {@link fetchRemoteModels} implementations.
     */
    protected async fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS) });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} from ${url}`);
        }
        return await response.json();
    }

    /**
     * Dynamic model listing: the live endpoint list merged with curated
     * metadata, cached for {@link MODEL_LIST_TTL_MS}. Falls back to the curated
     * list when the provider doesn't support listing or the fetch fails (with a
     * cooldown so a dead endpoint isn't re-probed on every dropdown open).
     */
    async listModels(): Promise<ModelInfo[]> {
        const now = Date.now();
        if (this.modelListCache && now - this.modelListCache.fetchedAt < MODEL_LIST_TTL_MS) {
            return this.modelListCache.models;
        }
        if (this.modelListFailedAt && now - this.modelListFailedAt < MODEL_LIST_FAILURE_COOLDOWN_MS) {
            return this.availableModels;
        }
        if (!this.modelListInFlight) {
            this.modelListInFlight = this.fetchAndMergeModels().finally(() => {
                this.modelListInFlight = undefined;
            });
        }
        return this.modelListInFlight;
    }

    private async fetchAndMergeModels(): Promise<ModelInfo[]> {
        try {
            const remote = await this.fetchRemoteModels();
            if (!remote || remote.length === 0) {
                return this.availableModels;
            }
            const merged = mergeModelLists(this.availableModels, remote);
            this.modelListCache = { models: merged, fetchedAt: Date.now() };
            this.modelListFailedAt = undefined;
            return merged;
        } catch (e) {
            this.modelListFailedAt = Date.now();
            getLog().info(`Dynamic model listing failed for provider ${this.name}, falling back to the curated list: ${e}`);
            return this.availableModels;
        }
    }

    /**
     * Build the system prompt. Delegates to the shared `system_prompt` module;
     * kept as an overridable method so providers can post-process the result
     * (e.g. Google appends a web-search/note-tool conflict notice).
     */
    protected buildSystemPrompt(messages: LlmMessage[], config: LlmProviderConfig): string | undefined {
        return composeSystemPrompt(messages, config);
    }

    /**
     * Build the ModelMessage array from LlmMessages (no provider-specific options).
     *
     * Only user/assistant turns are included here — the system prompt is passed
     * separately via the `system` option of `streamText` (see `buildSystemMessage`),
     * which is resilient against prompt injection.
     */
    protected buildMessages(chatMessages: LlmMessage[]): ModelMessage[] {
        return chatMessages.map(m => buildModelMessage(m));
    }

    /**
     * Attach the current-note metadata hint to the last user message.
     *
     * The hint is deliberately kept OUT of the system prompt: it changes whenever
     * the context note changes, and the system prompt carries the provider's
     * prompt-cache breakpoint — embedding volatile content there would invalidate
     * the cached system+tools prefix on every note edit. The last user message is
     * regenerated every turn and never cached, so it is the right home for it.
     */
    protected applyNoteHint(chatMessages: LlmMessage[], config: LlmProviderConfig): LlmMessage[] {
        if (!config.contextNoteId) {
            return chatMessages;
        }

        const lastUserIndex = chatMessages.map(m => m.role).lastIndexOf("user");
        if (lastUserIndex === -1) {
            return chatMessages;
        }

        const lastUserContent = chatMessages[lastUserIndex].content;
        const hasAttachments = Array.isArray(lastUserContent)
            && lastUserContent.some(p => p.type !== "text");

        const noteHint = buildNoteHint(config.contextNoteId, hasAttachments);
        if (!noteHint) {
            return chatMessages;
        }

        return chatMessages.map((m, i) => {
            if (i !== lastUserIndex) return m;
            if (typeof m.content === "string") {
                return { ...m, content: `${noteHint}\n\n${m.content}` };
            }
            // For multimodal content, prepend the hint as a leading text part so
            // any attached images still travel with the message.
            return {
                ...m,
                content: [{ type: "text" as const, text: noteHint }, ...m.content]
            };
        });
    }

    /**
     * Build the value for the `system` option of `streamText`. Subclasses can
     * override to attach provider-specific metadata (e.g. cache control).
     */
    protected buildSystemMessage(systemPrompt: string | undefined): string | SystemModelMessage | undefined {
        return systemPrompt;
    }

    /**
     * Add provider-specific web search tool. Override in subclasses that support it.
     */
    protected addWebSearchTool(_tools: ToolSet): void {}

    /**
     * Build the tool set based on config.
     */
    protected buildTools(config: LlmProviderConfig): ToolSet {
        const tools: ToolSet = {};

        if (config.enableWebSearch) {
            this.addWebSearchTool(tools);
        }

        if (config.enableNoteTools) {
            for (const registry of allToolRegistries) {
                Object.assign(tools, registry.toToolSet());
            }
        }

        return tools;
    }

    chat(messages: LlmMessage[], config: LlmProviderConfig): StreamResult {
        const systemPrompt = this.buildSystemPrompt(messages, config);
        const chatMessages = this.applyNoteHint(messages.filter(m => m.role !== "system"), config);
        const coreMessages = this.buildMessages(chatMessages);

        const streamOptions: Parameters<typeof streamText>[0] = {
            model: this.createModel(config.model || this.defaultModel),
            system: this.buildSystemMessage(systemPrompt),
            messages: coreMessages,
            maxOutputTokens: config.maxTokens || DEFAULT_MAX_TOKENS,
            // Reject any system message smuggled into `messages` (prompt injection guard).
            allowSystemInMessages: false,
            // The AI SDK's default onError handler dumps the raw error object straight
            // to stdout, bypassing Trilium's logger. The error is still delivered through
            // `fullStream`, where `streamToChunks` turns it into a detailed message that
            // the chat route logs — so suppress the unstructured stdout dump here.
            onError: () => {}
        };

        const tools = this.buildTools(config);
        if (Object.keys(tools).length > 0) {
            streamOptions.tools = tools;
            streamOptions.stopWhen = stepCountIs(15);
            streamOptions.toolChoice = "auto";
        }

        return streamText(streamOptions);
    }

    getModelPricing(model: string): ModelPricing | undefined {
        return this.modelPricing[model];
    }

    getAvailableModels(): ModelInfo[] {
        return this.availableModels;
    }

    async generateTitle(firstMessage: string): Promise<string> {
        const { text } = await generateText({
            model: this.createModel(this.titleModel),
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
