import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@triliumnext/core", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@triliumnext/core")>();
    return {
        ...actual,
        getLog: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })
    };
});

const createOpenAiMock = vi.fn();

vi.mock("@ai-sdk/openai", () => ({
    createOpenAI: (opts: unknown) => {
        createOpenAiMock(opts);
        const fn: any = () => ({});
        fn.chat = vi.fn((modelId: string) => ({ modelId }));
        return fn;
    }
}));

import { OllamaProvider } from "./ollama.js";

/** Minimal /api/tags payload with the fields the provider reads. */
function tagsResponse(models: Array<{ name: string; parameter_size?: string; quantization_level?: string }>) {
    return {
        ok: true,
        json: async () => ({
            models: models.map(m => ({
                name: m.name,
                model: m.name,
                details: {
                    parameter_size: m.parameter_size,
                    quantization_level: m.quantization_level
                }
            }))
        })
    } as Response;
}

describe("OllamaProvider", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        createOpenAiMock.mockClear();
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    describe("construction", () => {
        it("points the OpenAI-compatible client at the instance's /v1 endpoint", () => {
            new OllamaProvider("", "http://ollama.lan:11434");
            expect(createOpenAiMock).toHaveBeenCalledWith({ apiKey: "ollama", baseURL: "http://ollama.lan:11434/v1" });
        });

        it("defaults to the local instance and strips trailing slashes", () => {
            new OllamaProvider();
            expect(createOpenAiMock).toHaveBeenLastCalledWith({ apiKey: "ollama", baseURL: "http://localhost:11434/v1" });

            new OllamaProvider("", "http://ollama.lan:11434///");
            expect(createOpenAiMock).toHaveBeenLastCalledWith({ apiKey: "ollama", baseURL: "http://ollama.lan:11434/v1" });
        });

        it("falls back to the default base URL for invalid or non-http URLs", () => {
            new OllamaProvider("", "ftp://example.com");
            expect(createOpenAiMock).toHaveBeenLastCalledWith({ apiKey: "ollama", baseURL: "http://localhost:11434/v1" });

            new OllamaProvider("", "not a url");
            expect(createOpenAiMock).toHaveBeenLastCalledWith({ apiKey: "ollama", baseURL: "http://localhost:11434/v1" });
        });

        it("chats through the Chat Completions API, which every Ollama version supports", () => {
            const provider = new OllamaProvider() as any;
            expect(provider.createModel("llama3.2")).toEqual({ modelId: "llama3.2" });
        });
    });

    describe("listModels", () => {
        it("lists the installed models with names built from size and quantization", async () => {
            fetchMock.mockResolvedValue(tagsResponse([
                { name: "llama3.2:latest", parameter_size: "3.2B", quantization_level: "Q4_K_M" },
                { name: "plain-model" }
            ]));

            const models = await new OllamaProvider().listModels();

            expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/api/tags", expect.anything());
            expect(models.map(m => m.name)).toEqual([
                "llama3.2:latest (3.2B, Q4_K_M)",
                "plain-model"
            ]);
            // Models run on the user's own hardware, so they are free; the first
            // one stands in as the default since Ollama has no notion of one.
            expect(models[0].isDefault).toBe(true);
            expect(models.map(m => m.pricing)).toEqual([{ input: 0, output: 0 }, { input: 0, output: 0 }]);
        });

        it("caches the model list within the TTL and refetches after it expires", async () => {
            vi.useFakeTimers();
            fetchMock.mockResolvedValue(tagsResponse([{ name: "m1" }]));

            const provider = new OllamaProvider();
            await provider.listModels();
            await provider.listModels();
            expect(fetchMock).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(61 * 60 * 1000);
            await provider.listModels();
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it("does not cache an empty model list, so a first-use setup can recover", async () => {
            fetchMock.mockResolvedValue(tagsResponse([]));
            const provider = new OllamaProvider();
            await expect(provider.listModels()).resolves.toEqual([]);

            // Models get pulled in Ollama, the next call must refetch.
            fetchMock.mockResolvedValue(tagsResponse([{ name: "fresh" }]));
            const models = await provider.listModels();
            expect(models.map(m => m.id)).toEqual(["fresh"]);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it("surfaces an unreachable instance instead of masking it as an empty list", async () => {
            fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
            await expect(new OllamaProvider().listModels()).rejects.toThrow(/ECONNREFUSED/);
        });

        it("rejects a malformed /api/tags response", async () => {
            fetchMock.mockResolvedValue({ ok: true, json: async () => ({ error: "boom" }) } as Response);
            await expect(new OllamaProvider().listModels()).rejects.toThrow(/Unexpected \/api\/tags response shape/);
        });

        it("rejects when the instance responds with an error status", async () => {
            fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);
            await expect(new OllamaProvider().listModels()).rejects.toThrow(/HTTP 500/);
        });
    });

    describe("model defaults", () => {
        it("chats with the first model and writes titles with a small one", async () => {
            fetchMock.mockResolvedValue(tagsResponse([
                { name: "big-model", parameter_size: "70B" },
                { name: "small-model", parameter_size: "3B" }
            ]));

            const provider = new OllamaProvider();
            await provider.listModels();
            // Both are protected — observable only through the models the base
            // class picks, so assert through the internal fields.
            const internals = provider as unknown as { defaultModel: string; titleModel: string };
            expect(internals.defaultModel).toBe("big-model");
            expect(internals.titleModel).toBe("small-model");
        });

        it("falls back to a name-shaped small model, then to the default model", async () => {
            fetchMock.mockResolvedValue(tagsResponse([
                { name: "big-model", parameter_size: "70B" },
                { name: "phi-something" }
            ]));
            const byName = new OllamaProvider();
            await byName.listModels();
            expect((byName as unknown as { titleModel: string }).titleModel).toBe("phi-something");

            fetchMock.mockResolvedValue(tagsResponse([{ name: "only-big", parameter_size: "70B" }]));
            const onlyBig = new OllamaProvider();
            await onlyBig.listModels();
            expect((onlyBig as unknown as { titleModel: string }).titleModel).toBe("only-big");
        });

        it("resolves the title model before generating a title", async () => {
            fetchMock.mockResolvedValue(tagsResponse([{ name: "tiny", parameter_size: "1B" }]));
            const provider = new OllamaProvider();
            const generateTitle = vi.spyOn(
                Object.getPrototypeOf(Object.getPrototypeOf(provider)) as { generateTitle: () => Promise<string> },
                "generateTitle"
            ).mockResolvedValue("A title");

            await expect(provider.generateTitle("Hello")).resolves.toBe("A title");
            expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/api/tags", expect.anything());
            expect((provider as unknown as { titleModel: string }).titleModel).toBe("tiny");
            generateTitle.mockRestore();
        });
    });

    it("reports every model as free, whatever the price table knows", () => {
        expect(new OllamaProvider().getModelPricing()).toEqual({ input: 0, output: 0 });
    });
});
