import { describe, expect, it } from "vitest";

import type { ModelInfo } from "../types.js";
import { isGoogleChatModel, isOpenAiChatModel, mergeModelLists } from "./model_listing.js";

const CURATED: ModelInfo[] = [
    { id: "gpt-4.1", name: "GPT-4.1", pricing: { input: 2, output: 8 }, contextWindow: 1047576, isDefault: true, costMultiplier: 1 },
    { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", pricing: { input: 0.4, output: 1.6 }, contextWindow: 1047576, costMultiplier: 0.2 },
    { id: "gpt-4o", name: "GPT-4o", pricing: { input: 2.5, output: 10 }, contextWindow: 128000, isLegacy: true, costMultiplier: 1.2 }
];

describe("mergeModelLists", () => {
    it("keeps curated metadata for known models and appends unknown ones alphabetically", () => {
        const merged = mergeModelLists(CURATED, [
            { id: "gpt-9" },
            { id: "gpt-4.1-mini" },
            { id: "gpt-5" },
            { id: "gpt-4.1" }
        ]);
        expect(merged.map(m => m.id)).toEqual(["gpt-4.1", "gpt-4.1-mini", "gpt-5", "gpt-9"]);
        // Curated entries keep their full metadata...
        expect(merged[0]).toMatchObject({ name: "GPT-4.1", pricing: { input: 2, output: 8 }, isDefault: true, costMultiplier: 1 });
        // ...unknown ones carry no pricing/cost badge data.
        expect(merged[2]).toEqual({ id: "gpt-5", name: "gpt-5", contextWindow: undefined });
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
        for (const id of ["gpt-4.1", "gpt-5", "o3", "o4-mini", "chatgpt-4o-latest"]) {
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
            "babbage-002",
            "davinci-002",
            "gpt-4o-search-preview"
        ]) {
            expect(isOpenAiChatModel(id), id).toBe(false);
        }
    });
});

describe("isGoogleChatModel", () => {
    it("keeps Gemini chat models", () => {
        for (const id of ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-3-pro"]) {
            expect(isGoogleChatModel(id), id).toBe(true);
        }
    });

    it("drops embedding and media-generation models", () => {
        for (const id of ["text-embedding-004", "gemini-embedding-001", "aqa", "imagen-3.0-generate-002", "veo-2.0-generate-001", "gemini-2.5-flash-preview-tts"]) {
            expect(isGoogleChatModel(id), id).toBe(false);
        }
    });
});
