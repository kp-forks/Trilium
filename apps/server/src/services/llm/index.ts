import { getLog, options as optionService } from "@triliumnext/core";

import { AnthropicProvider } from "./providers/anthropic.js";
import { ClaudeAgentProvider } from "./providers/claude_agent.js";
import { GoogleProvider } from "./providers/google.js";
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
 * Get all models from every configured provider instance, tagged with the
 * provider type and the owning config's id/name. Each config is listed
 * separately (not deduped by type) so e.g. a real OpenAI key and a self-hosted
 * Ollama endpoint each contribute their own models. Providers that support
 * dynamic listing are queried live (in parallel); the rest — and any provider
 * whose lookup fails — contribute their curated list or are skipped.
 */
export async function getAllModels(): Promise<ModelInfo[]> {
    const configs = getConfiguredProviders();

    const modelsPerConfig = await Promise.all(configs.map(async config => {
        try {
            const provider = getProvider(config.id);
            const models = await (provider.listModels?.() ?? provider.getAvailableModels());
            return models.map(model => ({
                ...model,
                provider: config.provider,
                providerId: config.id,
                providerName: config.name
            }));
        } catch (e) {
            getLog().error(`Failed to get models from provider ${config.provider} (${config.id}): ${e}`);
            return [];
        }
    }));

    return modelsPerConfig.flat();
}

/**
 * Clear the provider cache. Call this when provider configurations change.
 */
export function clearProviderCache(): void {
    cachedProviders = {};
    cachedProvidersSource = null;
}

export type { LlmProvider, LlmProviderConfig, ModelInfo, ModelPricing } from "./types.js";
