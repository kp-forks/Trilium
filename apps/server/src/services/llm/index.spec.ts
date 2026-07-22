import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getOptionOrNullMock, errorMock } = vi.hoisted(() => ({
    getOptionOrNullMock: vi.fn(),
    errorMock: vi.fn()
}));

vi.mock("@triliumnext/core", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@triliumnext/core")>();
    return {
        ...actual,
        options: { ...actual.options, getOptionOrNull: getOptionOrNullMock },
        getLog: () => ({ error: errorMock, info: vi.fn(), warn: vi.fn() })
    };
});

/** Each provider stub records its constructor args and exposes a tagged model list. */
function makeProviderMock(tag: string) {
    return class {
        static lastArgs: unknown[] = [];
        constructor(...args: unknown[]) {
            (this.constructor as any).lastArgs = args;
        }
        getAvailableModels() {
            return [{ id: `${tag}-model`, name: `${tag} Model` }];
        }
    };
}

vi.mock("./providers/anthropic.js", () => ({ AnthropicProvider: makeProviderMock("anthropic") }));
vi.mock("./providers/openai.js", () => ({ OpenAiProvider: makeProviderMock("openai") }));
vi.mock("./providers/google.js", () => ({ GoogleProvider: makeProviderMock("google") }));
vi.mock("./providers/claude_agent.js", () => ({ ClaudeAgentProvider: makeProviderMock("claude-agent") }));

import {
    clearProviderCache,
    getAllModels,
    getProvider,
    getProviderByType,
    hasConfiguredProviders
} from "./index.js";

function setProviders(configs: unknown) {
    getOptionOrNullMock.mockReturnValue(typeof configs === "string" ? configs : JSON.stringify(configs));
}

const TWO = [
    { id: "a1", name: "My Claude", provider: "anthropic", apiKey: "k1", baseURL: "https://proxy" },
    { id: "o1", name: "My GPT", provider: "openai", apiKey: "k2" }
];

describe("llm/index provider registry", () => {
    beforeEach(() => {
        clearProviderCache();
        vi.clearAllMocks();
    });
    afterEach(() => {
        clearProviderCache();
    });

    describe("getProvider", () => {
        it("returns the first provider when no id is given and caches it", () => {
            setProviders(TWO);
            const p1 = getProvider();
            const p2 = getProvider();
            expect(p1).toBe(p2); // cached
            expect((p1.constructor as any).lastArgs).toEqual(["k1", "https://proxy"]);
        });

        it("returns the provider matching a given id", () => {
            setProviders(TWO);
            const p = getProvider("o1");
            expect((p.constructor as any).lastArgs).toEqual(["k2", undefined]);
        });

        it("instantiates each known provider type via its factory", () => {
            setProviders([
                { id: "a", name: "A", provider: "anthropic", apiKey: "ka" },
                { id: "o", name: "O", provider: "openai", apiKey: "ko" },
                { id: "g", name: "G", provider: "google", apiKey: "kg" },
                { id: "c", name: "C", provider: "claude-agent", apiKey: "" }
            ]);
            expect((getProvider("a").constructor as any).lastArgs).toEqual(["ka", undefined]);
            expect((getProvider("o").constructor as any).lastArgs).toEqual(["ko", undefined]);
            expect((getProvider("g").constructor as any).lastArgs).toEqual(["kg", undefined]);
            // The subscription provider takes no constructor args — auth is Claude Code's.
            expect((getProvider("c").constructor as any).lastArgs).toEqual([]);
        });

        it("throws when no providers are configured (null and empty array)", () => {
            getOptionOrNullMock.mockReturnValue(null);
            expect(() => getProvider()).toThrow(/No LLM providers configured/);
            setProviders([]);
            expect(() => getProvider()).toThrow(/No LLM providers configured/);
        });

        it("throws when the requested id is not found", () => {
            setProviders(TWO);
            expect(() => getProvider("nope")).toThrow(/not found: nope/);
        });

        it("throws for an unknown provider type", () => {
            setProviders([{ id: "x", name: "X", provider: "mystery", apiKey: "k" }]);
            expect(() => getProvider("x")).toThrow(/Unknown LLM provider type: mystery/);
        });

        it("drops cached instances when the llmProviders option changes", () => {
            setProviders(TWO);
            const p1 = getProvider("a1");
            // Same config → still cached.
            setProviders(TWO);
            expect(getProvider("a1")).toBe(p1);
            // Edited config (e.g. new API key) → cache self-invalidates.
            setProviders([{ ...TWO[0], apiKey: "new-key" }, TWO[1]]);
            const p2 = getProvider("a1");
            expect(p2).not.toBe(p1);
            expect((p2.constructor as any).lastArgs).toEqual(["new-key", "https://proxy"]);
        });
    });

    describe("getConfiguredProviders error handling (via hasConfiguredProviders)", () => {
        it("treats malformed JSON as no providers and logs the error", () => {
            getOptionOrNullMock.mockReturnValue("{not json");
            expect(hasConfiguredProviders()).toBe(false);
            expect(errorMock).toHaveBeenCalled();
        });

        it("treats a null option as no providers", () => {
            getOptionOrNullMock.mockReturnValue(null);
            expect(hasConfiguredProviders()).toBe(false);
        });

        it("reports true when providers exist", () => {
            setProviders(TWO);
            expect(hasConfiguredProviders()).toBe(true);
        });
    });

    describe("getProviderByType", () => {
        it("returns the first provider of the given type", () => {
            setProviders(TWO);
            const p = getProviderByType("openai");
            expect((p.constructor as any).lastArgs).toEqual(["k2", undefined]);
        });

        it("throws when no provider of that type is configured", () => {
            setProviders(TWO);
            expect(() => getProviderByType("google")).toThrow(/No google provider configured/);
        });
    });

    describe("getAllModels", () => {
        it("aggregates models across providers, tagged with type and config id/name", async () => {
            setProviders(TWO);
            const models = await getAllModels();
            expect(models).toEqual([
                { id: "anthropic-model", name: "anthropic Model", provider: "anthropic", providerId: "a1", providerName: "My Claude" },
                { id: "openai-model", name: "openai Model", provider: "openai", providerId: "o1", providerName: "My GPT" }
            ]);
        });

        it("lists every config separately, even two of the same type", async () => {
            // e.g. a real OpenAI key plus a self-hosted Ollama endpoint.
            setProviders([
                { id: "o1", name: "OpenAI", provider: "openai", apiKey: "k1" },
                { id: "o2", name: "My Ollama", provider: "openai", apiKey: "k2", baseURL: "http://localhost:11434/v1" }
            ]);
            const models = await getAllModels();
            expect(models.map(m => [m.providerId, m.providerName])).toEqual([
                ["o1", "OpenAI"],
                ["o2", "My Ollama"]
            ]);
        });

        it("prefers dynamic listModels() when the provider implements it", async () => {
            setProviders(TWO);
            const provider = getProvider("a1") as { listModels?: () => Promise<unknown> };
            provider.listModels = vi.fn().mockResolvedValue([{ id: "dyn-model", name: "Dynamic Model" }]);
            const models = await getAllModels();
            expect(models[0]).toEqual({
                id: "dyn-model",
                name: "Dynamic Model",
                provider: "anthropic",
                providerId: "a1",
                providerName: "My Claude"
            });
        });

        it("skips and logs a provider whose model lookup throws, keeping the rest", async () => {
            setProviders([
                { id: "x", name: "X", provider: "mystery", apiKey: "k" },
                { id: "o1", name: "My GPT", provider: "openai", apiKey: "k2" }
            ]);
            // Unknown type → getProvider throws inside getAllModels and is caught.
            const models = await getAllModels();
            expect(models.map(m => m.providerId)).toEqual(["o1"]);
            expect(errorMock).toHaveBeenCalled();
        });
    });
});
