import { createOpenAI, type OpenAIProvider as OpenAISDKProvider } from "@ai-sdk/openai";
import type { ToolSet } from "ai";

import { BaseProvider } from "./base_provider.js";
import { isOpenAiChatModel, openAiModelName, type RemoteModel } from "./model_listing.js";

const OFFICIAL_BASE_URL = "https://api.openai.com/v1";

export class OpenAiProvider extends BaseProvider {
    name = "openai";
    protected defaultModel = "gpt-4.1";
    protected titleModel = "gpt-4.1-mini";

    /** The `/models` endpoint returns no display names, so derive friendly ones. */
    protected override modelName(id: string): string {
        return openAiModelName(id);
    }

    private openai: OpenAISDKProvider;

    constructor(apiKey: string, baseURL?: string) {
        super(apiKey, baseURL);
        if (!apiKey) {
            throw new Error("API key is required for OpenAI provider");
        }
        this.openai = createOpenAI({ apiKey, ...(baseURL && { baseURL }) });
    }

    protected createModel(modelId: string) {
        return this.openai(modelId);
    }

    /**
     * List models from the OpenAI-compatible `/models` endpoint. On the
     * official endpoint the list is full of non-chat models (embeddings,
     * whisper, TTS, ...), which are filtered out; a custom baseURL (Ollama,
     * vLLM, LM Studio, LiteLLM) lists exactly what the endpoint offers.
     */
    protected override async fetchRemoteModels(): Promise<RemoteModel[] | null> {
        const payload = await this.fetchJson(`${this.baseURL ?? OFFICIAL_BASE_URL}/models`, {
            Authorization: `Bearer ${this.apiKey}`
        });
        const data = (payload as { data?: unknown }).data;
        if (!Array.isArray(data)) {
            throw new Error("Unexpected /models response shape");
        }
        const ids = data
            .filter((m): m is { id: string } => typeof (m as { id?: unknown }).id === "string")
            .map(m => m.id);
        // Custom endpoints list exactly what they serve; the official one is
        // filtered to chat models and deduped of pinned snapshots.
        const chatIds = this.baseURL ? ids : ids.filter(isOpenAiChatModel);
        // OpenAI's /models has no display names, so derive friendly ones.
        return chatIds.map(id => ({ id, name: openAiModelName(id) }));
    }

    protected override addWebSearchTool(tools: ToolSet): void {
        tools.web_search = this.openai.tools.webSearch();
    }
}
