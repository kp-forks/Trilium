import type { LlmProvider } from "./types.js";
import { AnthropicProvider } from "./providers/anthropic.js";

const providers: Record<string, () => LlmProvider> = {
    anthropic: () => new AnthropicProvider()
    // Future providers can be added here
};

let cachedProviders: Record<string, LlmProvider> = {};

export function getProvider(name: string = "anthropic"): LlmProvider {
    if (!cachedProviders[name]) {
        const factory = providers[name];
        if (!factory) {
            throw new Error(`Unknown LLM provider: ${name}. Available: ${Object.keys(providers).join(", ")}`);
        }
        cachedProviders[name] = factory();
    }
    return cachedProviders[name];
}

export function clearProviderCache(): void {
    cachedProviders = {};
}

export type { LlmProvider, LlmProviderConfig, ModelInfo, ModelPricing } from "./types.js";
