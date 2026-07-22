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
        listModels() {
            // A current model plus a preview one — the fallback recommendation
            // rule (non-openai) keeps the former and drops the latter.
            return Promise.resolve([
                { id: `${tag}-model`, name: `${tag} Model` },
                { id: `${tag}-preview`, name: `${tag} Preview` }
            ]);
        }
    };
}

vi.mock("./providers/anthropic.js", () => ({ AnthropicProvider: makeProviderMock("anthropic") }));
vi.mock("./providers/openai.js", () => ({ OpenAiProvider: makeProviderMock("openai") }));
vi.mock("./providers/google.js", () => ({ GoogleProvider: makeProviderMock("google") }));
vi.mock("./providers/claude_agent.js", () => ({ ClaudeAgentProvider: makeProviderMock("claude-agent") }));

import {
    clearProviderCache,
    getProvider,
    getProviderByType,
    getSelectedModel,
    hasConfiguredProviders,
    listProviderModels
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

    describe("listProviderModels", () => {
        it("lists models for ad-hoc credentials, tagged with the recommended flag", async () => {
            // No saved config needed — the add/edit flow passes raw credentials.
            // Uses "google" to exercise the generic non-preview fallback rule;
            // provider-specific recommendation rules are covered in model_listing.spec.
            const models = await listProviderModels("google", "k");
            expect(models).toEqual([
                { id: "google-model", name: "google Model", recommended: true },
                { id: "google-preview", name: "google Preview", recommended: false }
            ]);
        });

        it("throws for an unknown provider type", async () => {
            await expect(listProviderModels("mystery", "k")).rejects.toThrow(/Unknown LLM provider type: mystery/);
        });
    });

    describe("getSelectedModel", () => {
        it("finds a stored selected model by config id and model id", () => {
            setProviders([
                { id: "o1", name: "My GPT", provider: "openai", apiKey: "k", selectedModels: [
                    { id: "gpt-9", name: "GPT-9", pricing: { input: 1, output: 2 } }
                ] }
            ]);
            expect(getSelectedModel("o1", "gpt-9")).toMatchObject({ name: "GPT-9", pricing: { input: 1, output: 2 } });
        });

        it("returns undefined for a missing provider, model, or providerId", () => {
            setProviders([{ id: "o1", name: "My GPT", provider: "openai", apiKey: "k", selectedModels: [{ id: "gpt-9", name: "GPT-9" }] }]);
            expect(getSelectedModel("o1", "absent")).toBeUndefined();
            expect(getSelectedModel("nope", "gpt-9")).toBeUndefined();
            expect(getSelectedModel(undefined, "gpt-9")).toBeUndefined();
        });
    });
});
