import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

const createOpenAIMock = vi.fn();
const webSearchMock = vi.fn(() => ({ kind: "web_search" }));
const modelMock = vi.fn((modelId: string) => ({ modelId }));

vi.mock("@ai-sdk/openai", () => ({
    createOpenAI: (opts: unknown) => {
        createOpenAIMock(opts);
        const fn: any = (modelId: string) => modelMock(modelId);
        fn.tools = { webSearch: webSearchMock };
        return fn;
    }
}));

const { streamTextMock } = vi.hoisted(() => ({
    streamTextMock: vi.fn((..._args: any[]) => ({}) as any)
}));

vi.mock("ai", async (importOriginal) => {
    const actual = await importOriginal<typeof import("ai")>();
    return { ...actual, streamText: streamTextMock };
});

import { OpenAiProvider } from "./openai.js";

describe("OpenAiProvider construction", () => {
    beforeEach(() => {
        createOpenAIMock.mockClear();
    });

    it("forwards apiKey only when no baseURL provided", () => {
        new OpenAiProvider("sk-test");
        expect(createOpenAIMock).toHaveBeenCalledTimes(1);
        expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: "sk-test" });
    });

    it("forwards apiKey and baseURL when both provided", () => {
        new OpenAiProvider("sk-test", "http://localhost:11434/v1");
        expect(createOpenAIMock).toHaveBeenCalledWith({
            apiKey: "sk-test",
            baseURL: "http://localhost:11434/v1"
        });
    });

    it("omits baseURL when empty string is provided", () => {
        new OpenAiProvider("sk-test", "");
        expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: "sk-test" });
    });

    it("throws when apiKey is missing", () => {
        expect(() => new OpenAiProvider("")).toThrow(/API key is required/);
    });
});

describe("OpenAiProvider chat", () => {
    beforeEach(() => {
        streamTextMock.mockClear();
        webSearchMock.mockClear();
        modelMock.mockClear();
    });

    it("createModel uses the configured model id, falling back to the default", () => {
        const provider = new OpenAiProvider("sk-test");
        provider.chat([{ role: "user", content: "hi" }], {});
        expect(modelMock).toHaveBeenLastCalledWith("gpt-4.1");

        provider.chat([{ role: "user", content: "hi" }], { model: "o3" });
        expect(modelMock).toHaveBeenLastCalledWith("o3");
    });

    it("adds the OpenAI web_search tool when web search is enabled", () => {
        const provider = new OpenAiProvider("sk-test");
        provider.chat([{ role: "user", content: "hi" }], { enableWebSearch: true });

        expect(webSearchMock).toHaveBeenCalledOnce();
        const opts = streamTextMock.mock.calls[0][0] as any;
        expect(opts.tools.web_search).toEqual({ kind: "web_search" });
        // Tools present → agentic loop options are set.
        expect(opts.toolChoice).toBe("auto");
        expect(opts.stopWhen).toBeDefined();
    });
});

describe("OpenAiProvider model listing", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const okJson = (body: unknown) => ({ ok: true, json: async () => body });

    it("fetches the official endpoint with the API key and filters non-chat models", async () => {
        fetchMock.mockResolvedValue(okJson({ data: [{ id: "gpt-4.1" }, { id: "whisper-1" }, { id: "text-embedding-3-large" }, { id: "gpt-9" }] }));
        const provider = new OpenAiProvider("sk-test");

        const models = await provider.listModels();
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.openai.com/v1/models",
            expect.objectContaining({ headers: { Authorization: "Bearer sk-test" } })
        );
        expect(models.map((m) => m.id)).toEqual(["gpt-4.1", "gpt-9"]);
        // Curated metadata survives the merge; unknown models have none.
        expect(models[0]).toMatchObject({ name: "GPT-4.1", isDefault: true });
        expect(models[1].pricing).toBeUndefined();
    });

    it("lists a custom endpoint unfiltered (self-hosted Ollama/vLLM)", async () => {
        fetchMock.mockResolvedValue(okJson({ data: [{ id: "llama3.2" }, { id: "nomic-embed-text" }] }));
        // Trailing slash on the user-entered base URL is normalized away.
        const provider = new OpenAiProvider("unused", "http://localhost:11434/v1/");

        const models = await provider.listModels();
        expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/v1/models", expect.anything());
        expect(models.map((m) => m.id)).toEqual(["llama3.2", "nomic-embed-text"]);
        // None of the curated models exist here → the first model becomes default.
        expect(models[0].isDefault).toBe(true);
    });

    it("falls back to the curated list on HTTP errors", async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 500 });
        const provider = new OpenAiProvider("sk-test");
        const models = await provider.listModels();
        expect(models.map((m) => m.id)).toContain("gpt-4.1-mini");
    });

    it("falls back to the curated list on a malformed response body", async () => {
        fetchMock.mockResolvedValue(okJson({ nope: true }));
        const provider = new OpenAiProvider("sk-test");
        const models = await provider.listModels();
        expect(models.map((m) => m.id)).toContain("gpt-4.1");
    });
});
