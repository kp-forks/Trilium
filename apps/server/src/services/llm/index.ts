import { getLog, options as optionService } from "@triliumnext/core";

import { AnthropicProvider } from "./providers/anthropic.js";
import { ClaudeAgentProvider } from "./providers/claude_agent.js";
import { GoogleProvider } from "./providers/google.js";
import { recommendedModelIds } from "./providers/model_listing.js";
import { OpenAiProvider } from "./providers/openai.js";
import type { LlmProvider, ModelInfo } from "./types.js";

/**
 * Configuration for a single LLM provider instance.
 * This matches the structure stored in the llmProviders option.
 */
export interface LlmProviderSetup {
    id: string;
    name: string;
    provider: string;
    apiKey: string;
    /** Optional override for the SDK's default API endpoint (e.g. for self-hosted Ollama, vLLM, or proxies). */
    baseURL?: string;
    /**
     * Models the user selected for this provider, with full metadata denormalized
     * so the chat picker renders them without a live fetch. Absent in configs
     * saved before model selection existed.
     */
    selectedModels?: ModelInfo[];
}

/** Factory functions for creating provider instances */
const providerFactories: Record<string, (apiKey: string, baseURL?: string) => LlmProvider> = {
    anthropic: (apiKey, baseURL) => new AnthropicProvider(apiKey, baseURL),
    openai: (apiKey, baseURL) => new OpenAiProvider(apiKey, baseURL),
    google: (apiKey, baseURL) => new GoogleProvider(apiKey, baseURL),
    // Claude Pro/Max subscription via the Claude Agent SDK — no API key;
    // authentication is handled by Claude Code itself (`claude /login`).
    "claude-agent": () => new ClaudeAgentProvider()
};

/** Cache of instantiated providers by their config ID */
let cachedProviders: Record<string, LlmProvider> = {};

/**
 * The raw llmProviders JSON the cache was built from. When the option changes
 * (provider added/edited/removed in the settings), the cache self-invalidates
 * so stale instances — and their dynamic model-list caches — are dropped.
 */
let cachedProvidersSource: string | null = null;

/**
 * Get configured providers from the options.
 */
function getConfiguredProviders(): LlmProviderSetup[] {
    try {
        const providersJson = optionService.getOptionOrNull("llmProviders");
        if (providersJson !== cachedProvidersSource) {
            cachedProviders = {};
            cachedProvidersSource = providersJson;
        }
        if (!providersJson) {
            return [];
        }
        return JSON.parse(providersJson) as LlmProviderSetup[];
    } catch (e) {
        getLog().error(`Failed to parse llmProviders option: ${e}`);
        return [];
    }
}

/**
 * Get a provider instance by its configuration ID.
 * If no ID is provided, returns the first configured provider.
 */
export function getProvider(providerId?: string): LlmProvider {
    const configs = getConfiguredProviders();

    if (configs.length === 0) {
        throw new Error("No LLM providers configured. Please add a provider in Options → AI / LLM.");
    }

    // Find the requested provider or use the first one
    const config = providerId
        ? configs.find(c => c.id === providerId)
        : configs[0];

    if (!config) {
        throw new Error(`LLM provider not found: ${providerId}`);
    }

    // Check cache
    if (cachedProviders[config.id]) {
        return cachedProviders[config.id];
    }

    // Create new provider instance
    const factory = providerFactories[config.provider];
    if (!factory) {
        throw new Error(`Unknown LLM provider type: ${config.provider}. Available: ${Object.keys(providerFactories).join(", ")}`);
    }

    const provider = factory(config.apiKey, config.baseURL);
    cachedProviders[config.id] = provider;
    return provider;
}

/**
 * Get the first configured provider of a specific type (e.g., "anthropic").
 */
export function getProviderByType(providerType: string): LlmProvider {
    const configs = getConfiguredProviders();
    const config = configs.find(c => c.provider === providerType);

    if (!config) {
        throw new Error(`No ${providerType} provider configured. Please add one in Options → AI / LLM.`);
    }

    return getProvider(config.id);
}

/**
 * Check if any providers are configured.
 */
export function hasConfiguredProviders(): boolean {
    return getConfiguredProviders().length > 0;
}

/**
 * List the models available for a provider described by raw credentials —
 * used by the model-selection screen during the add/edit flow, where the
 * provider config isn't necessarily persisted yet. Instantiates the provider
 * ad-hoc (bypassing the config cache) and queries it live, falling back to its
 * curated list when it doesn't support dynamic listing.
 */
export async function listProviderModels(provider: string, apiKey: string, baseURL?: string): Promise<ModelInfo[]> {
    const factory = providerFactories[provider];
    if (!factory) {
        throw new Error(`Unknown LLM provider type: ${provider}. Available: ${Object.keys(providerFactories).join(", ")}`);
    }
    const instance = factory(apiKey, baseURL);
    const models = await (instance.listModels?.() ?? instance.getAvailableModels());
    // Tag the default-selected set here so the recommendation rule lives on the
    // server (next to the model metadata) rather than in the client picker.
    const recommended = recommendedModelIds(models, provider);
    return models.map(model => ({ ...model, recommended: recommended.has(model.id) }));
}

/**
 * Find the model a chat is targeting within its provider config's stored
 * selection — the denormalized source of display name and pricing for the
 * response's usage/cost, working even for dynamically discovered models the
 * curated list doesn't know. Returns undefined when the model isn't stored.
 */
export function getSelectedModel(providerId: string | undefined, modelId: string): ModelInfo | undefined {
    if (!providerId) {
        return undefined;
    }
    const config = getConfiguredProviders().find(c => c.id === providerId);
    return config?.selectedModels?.find(m => m.id === modelId);
}

/**
 * Clear the provider cache. Call this when provider configurations change.
 */
export function clearProviderCache(): void {
    cachedProviders = {};
    cachedProvidersSource = null;
}

export type { LlmProvider, LlmProviderConfig, ModelInfo, ModelPricing } from "./types.js";
