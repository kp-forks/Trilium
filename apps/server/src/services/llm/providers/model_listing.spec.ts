import { describe, expect, it } from "vitest";

import type { ModelInfo } from "../types.js";
import { isGoogleChatModel, isOpenAiChatModel, mergeModelLists, openAiModelName, recommendedModelIds } from "./model_listing.js";

const CURATED: ModelInfo[] = [
    { id: "gpt-4.1", name: "GPT-4.1", pricing: { input: 2, output: 8 }, contextWindow: 1047576, isDefault: true },
    { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", pricing: { input: 0.4, output: 1.6 }, contextWindow: 1047576 },
    { id: "gpt-4o", name: "GPT-4o", pricing: { input: 2.5, output: 10 }, contextWindow: 128000, isLegacy: true }
];

describe("mergeModelLists", () => {
    it("keeps base metadata for known models and appends unknown ones alphabetically", () => {
        const merged = mergeModelLists(CURATED, [
            { id: "gpt-9" },
            { id: "gpt-4.1-mini" },
            { id: "gpt-5" },
            { id: "gpt-4.1" }
        ]);
        expect(merged.map(m => m.id)).toEqual(["gpt-4.1", "gpt-4.1-mini", "gpt-5", "gpt-9"]);
        // Base entries keep their pricing/default metadata...
        expect(merged[0]).toMatchObject({ name: "GPT-4.1", pricing: { input: 2, output: 8 }, isDefault: true });
        // ...unknown ones carry no pricing.
        expect(merged[2]).toEqual({ id: "gpt-5", name: "gpt-5", contextWindow: undefined });
    });

    it("prefers the endpoint's display name over the base list's for known models", () => {
        const merged = mergeModelLists(
            [{ id: "gpt-4.1", name: "gpt-4.1", pricing: { input: 2, output: 8 } }],
            [{ id: "gpt-4.1", name: "GPT-4.1 (from endpoint)" }]
        );
        expect(merged[0].name).toBe("GPT-4.1 (from endpoint)");
    });

    it("drops curated models absent from the remote list", () => {
        const merged = mergeModelLists(CURATED, [{ id: "gpt-4.1" }]);
        expect(merged.map(m => m.id)).toEqual(["gpt-4.1"]);
    });

    it("uses the remote display name and context window when provided", () => {
        const merged = mergeModelLists([], [{ id: "llama3.2", name: "Llama 3.2", contextWindow: 131072 }]);
        expect(merged[0]).toMatchObject({ id: "llama3.2", name: "Llama 3.2", contextWindow: 131072, isDefault: true });
    });

    it("fills a curated model's missing context window from the remote data", () => {
        const curated: ModelInfo[] = [{ id: "m", name: "M", pricing: { input: 1, output: 1 } }];
        const merged = mergeModelLists(curated, [{ id: "m", contextWindow: 32000 }]);
        expect(merged[0].contextWindow).toBe(32000);
    });

    it("promotes the first model to default when the curated default is unavailable", () => {
        const merged = mergeModelLists(CURATED, [{ id: "gpt-4o" }, { id: "custom-model" }]);
        expect(merged.map(m => [m.id, m.isDefault ?? false])).toEqual([
            ["gpt-4o", true],
            ["custom-model", false]
        ]);
    });

    it("returns an empty list when the remote list shares nothing and is empty", () => {
        expect(mergeModelLists(CURATED, [])).toEqual([]);
    });
});

describe("isOpenAiChatModel", () => {
    it("keeps chat model families, including unknown future ones", () => {
        for (const id of ["gpt-4.1", "gpt-5", "gpt-5.6-sol", "o3", "o4-mini", "chatgpt-4o-latest"]) {
            expect(isOpenAiChatModel(id), id).toBe(true);
        }
    });

    it("drops non-chat families", () => {
        for (const id of [
            "text-embedding-3-large",
            "whisper-1",
            "tts-1-hd",
            "dall-e-3",
            "omni-moderation-latest",
            "gpt-4o-realtime-preview",
            "gpt-4o-audio-preview",
            "gpt-4o-transcribe",
            "gpt-image-1",
            "sora-2",
            "computer-use-preview",
            "codex-mini-latest",
            "gpt-3.5-turbo-instruct",
            "o3-deep-research",
            "babbage-002",
            "davinci-002",
            "gpt-4o-search-preview",
            "chat-latest" // bare rolling alias, dropped; versioned gpt-*-chat-latest are kept
        ]) {
            expect(isOpenAiChatModel(id), id).toBe(false);
        }
    });

    it("drops pinned snapshots that duplicate a rolling base id", () => {
        for (const id of [
            "gpt-4o-2024-05-13",
            "gpt-5-2025-08-07",
            "gpt-4.1-mini-2025-04-14",
            "gpt-4-turbo-2024-04-09",
            "o3-2025-04-16",
            "o4-mini-2025-04-16",
            "gpt-3.5-turbo-0125",
            "gpt-3.5-turbo-1106",
            "gpt-4-0613"
        ]) {
            expect(isOpenAiChatModel(id), id).toBe(false);
        }
        // ...but the rolling base ids and non-snapshot suffixes survive.
        for (const id of ["gpt-4o", "gpt-5", "gpt-4.1-mini", "gpt-3.5-turbo-16k", "gpt-5-chat-latest"]) {
            expect(isOpenAiChatModel(id), id).toBe(true);
        }
    });
});

describe("openAiModelName", () => {
    it("prettifies gpt-* ids into friendly names", () => {
        expect(openAiModelName("gpt-4.1")).toBe("GPT-4.1");
        expect(openAiModelName("gpt-4.1-mini")).toBe("GPT-4.1 Mini");
        expect(openAiModelName("gpt-4o")).toBe("GPT-4o");
        expect(openAiModelName("gpt-4o-mini")).toBe("GPT-4o Mini");
        expect(openAiModelName("gpt-5.6-sol")).toBe("GPT-5.6 Sol");
        expect(openAiModelName("gpt-3.5-turbo")).toBe("GPT-3.5 Turbo");
        expect(openAiModelName("gpt-5-chat-latest")).toBe("GPT-5 Chat Latest");
    });

    it("leaves the o-series in OpenAI's canonical lowercase-hyphenated form", () => {
        // Kept distinct from "GPT-4o Mini"; only the GPT family is reshaped.
        expect(openAiModelName("o1")).toBe("o1");
        expect(openAiModelName("o3")).toBe("o3");
        expect(openAiModelName("o3-mini")).toBe("o3-mini");
        expect(openAiModelName("o4-mini")).toBe("o4-mini");
        expect(openAiModelName("o1-pro")).toBe("o1-pro");
    });

    it("leaves non-OpenAI ids untouched", () => {
        expect(openAiModelName("llama3.2")).toBe("llama3.2"); // self-hosted endpoint
        expect(openAiModelName("chatgpt-4o-latest")).toBe("chatgpt-4o-latest");
    });
});

describe("isGoogleChatModel", () => {
    it("keeps Gemini chat models, including unknown future ones", () => {
        for (const id of [
            "gemini-2.5-pro",
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite",
            "gemini-3-flash-preview",
            "gemini-3.1-pro-preview",
            "gemini-3.5-flash",
            "gemini-3.6-flash",
            "gemini-2.0-flash-exp"
        ]) {
            expect(isGoogleChatModel(id), id).toBe(true);
        }
    });

    it("drops non-Gemini families wholesale", () => {
        for (const id of [
            "text-embedding-004",
            "aqa",
            "imagen-3.0-generate-002",
            "veo-3.1-generate-preview",
            "lyria-3-pro-preview",
            "gemma-4-26b-a4b-it",
            "deep-research-preview-04-2026",
            "antigravity-preview-05-2026",
            "learnlm-2.0-flash-experimental"
        ]) {
            expect(isGoogleChatModel(id), id).toBe(false);
        }
    });

    it("drops non-conversational gemini-* variants (media, robotics, computer use)", () => {
        for (const id of [
            "gemini-embedding-001",
            "gemini-2.5-flash-image", // Nano Banana
            "gemini-3-pro-image", // Nano Banana Pro
            "gemini-3.1-flash-lite-image", // Nano Banana 2 Lite
            "gemini-2.5-flash-preview-tts",
            "gemini-3.1-flash-live-preview",
            "gemini-2.5-flash-native-audio-preview-12-2025",
            "gemini-omni-flash",
            "gemini-robotics-er-1.6-preview",
            "gemini-2.5-computer-use-preview-10-2025",
            "gemini-3.1-pro-preview-customtools" // real id — no hyphen in "customtools"
        ]) {
            expect(isGoogleChatModel(id), id).toBe(false);
        }
    });

    it("drops rolling aliases and pinned revisions that duplicate stable ids", () => {
        for (const id of ["gemini-flash-latest", "gemini-pro-latest", "gemini-flash-lite-latest", "gemini-2.0-flash-lite-001"]) {
            expect(isGoogleChatModel(id), id).toBe(false);
        }
    });
});

describe("recommendedModelIds", () => {
    // A representative slice of a live OpenAI /models response.
    const OPENAI = [
        "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4", "gpt-3.5-turbo",
        "gpt-5", "gpt-5-mini", "gpt-5-chat-latest", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-pro",
        "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna",
        "o1", "o1-pro", "o3", "o3-mini", "o4-mini"
    ].map(id => ({ id }));

    it("recommends only the newest generation of each OpenAI line, core tiers only", () => {
        const ids = recommendedModelIds(OPENAI, "openai");
        // Newest GPT generation (5.6) + newest o-series (o4) — nothing older.
        expect([...ids].sort()).toEqual(["gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "o4-mini"]);
    });

    it("excludes -pro and -chat-latest even within the newest generation", () => {
        const ids = recommendedModelIds([
            { id: "gpt-9-sol" }, { id: "gpt-9-pro" }, { id: "gpt-9-chat-latest" }
        ], "openai");
        expect([...ids]).toEqual(["gpt-9-sol"]);
    });

    it("degrades to the newest available generation for an older-only endpoint", () => {
        const ids = recommendedModelIds([{ id: "gpt-4" }, { id: "gpt-4.1" }, { id: "gpt-4o" }], "openai");
        expect([...ids]).toEqual(["gpt-4.1"]); // 4.1 > 4o (4.0) > 4
    });

    it("recommends nothing for an OpenAI-compatible endpoint with no gpt/o models", () => {
        expect(recommendedModelIds([{ id: "llama3.2" }, { id: "qwen2.5" }], "openai").size).toBe(0);
    });

    it("recommends the newest version of each Claude family for Anthropic", () => {
        const ids = recommendedModelIds([
            "claude-fable-5",
            "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-opus-4-20250514",
            "claude-sonnet-5", "claude-sonnet-4-6", "claude-sonnet-4-20250514",
            "claude-haiku-4-5-20251001"
        ].map(id => ({ id })), "anthropic");
        // One per family, newest each — Fable 5, Opus 4.8, Sonnet 5, Haiku 4.5.
        expect([...ids].sort()).toEqual([
            "claude-fable-5", "claude-haiku-4-5-20251001", "claude-opus-4-8", "claude-sonnet-5"
        ]);
    });

    it("uses the same per-family newest-version rule for the Claude Code subscription provider", () => {
        // The claude-agent provider shares Anthropic's id shape, so it recommends
        // one model per family — not the generic non-legacy default.
        const ids = recommendedModelIds([
            "claude-fable-5", "claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-5", "claude-haiku-4-5-20251001"
        ].map(id => ({ id })), "claude-agent");
        expect([...ids].sort()).toEqual([
            "claude-fable-5", "claude-haiku-4-5-20251001", "claude-opus-4-8", "claude-sonnet-5"
        ]);
    });

    it("treats an Anthropic snapshot date as the version, not a minor bump", () => {
        // sonnet-4-20250514 is 4.0, so sonnet-4-6 (4.6) must outrank it.
        const ids = recommendedModelIds([{ id: "claude-sonnet-4-20250514" }, { id: "claude-sonnet-4-6" }], "anthropic");
        expect([...ids]).toEqual(["claude-sonnet-4-6"]);
    });

    it("falls back to non-preview, non-legacy models for other providers", () => {
        const ids = recommendedModelIds([
            { id: "gemini-2.5-flash" },
            { id: "gemini-3-flash-preview" },
            { id: "gemini-2.0-flash", isLegacy: true }
        ], "google");
        expect([...ids]).toEqual(["gemini-2.5-flash"]);
    });
});
