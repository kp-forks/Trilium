/**
 * Pure logic for dynamic model listing: merging a live-fetched model list with
 * the curated (hard-coded) metadata, and filtering provider noise. Kept free of
 * I/O so it can be unit-tested in isolation — the fetching itself lives in the
 * individual providers.
 */

import type { ModelInfo } from "../types.js";

/**
 * A model as reported by a provider's models endpoint. Only what the listing
 * APIs actually return — pricing is never part of it.
 */
export interface RemoteModel {
    id: string;
    /** Human-readable name, when the API provides one (e.g. Anthropic's `display_name`). */
    name?: string;
    /** Context window in tokens, when the API provides one (e.g. Google's `inputTokenLimit`). */
    contextWindow?: number;
}

/**
 * Merge a live-fetched model list with the curated metadata list.
 *
 * The remote list is the source of truth for *availability*: curated models
 * absent from it are dropped, remote models unknown to the curated list are
 * included with whatever metadata the endpoint reported (no pricing, no cost
 * multiplier). Curated entries supply name, pricing, context window and the
 * legacy flag for models they know.
 *
 * Ordering: curated-known models first (in curated order), then unknown remote
 * models alphabetically. The curated default keeps its flag when present;
 * otherwise the first merged model becomes the default so callers relying on
 * `find(m => m.isDefault)` keep working.
 */
export function mergeModelLists(curated: ModelInfo[], remote: RemoteModel[]): ModelInfo[] {
    const remoteById = new Map(remote.map(m => [m.id, m]));

    const known = curated
        .filter(m => remoteById.has(m.id))
        .map(m => {
            const remoteModel = remoteById.get(m.id);
            return { ...m, contextWindow: m.contextWindow ?? remoteModel?.contextWindow };
        });

    const curatedIds = new Set(curated.map(m => m.id));
    const unknown = remote
        .filter(m => !curatedIds.has(m.id))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map<ModelInfo>(m => ({
            id: m.id,
            name: m.name ?? m.id,
            contextWindow: m.contextWindow
        }));

    const merged = [...known, ...unknown];
    if (merged.length > 0 && !merged.some(m => m.isDefault)) {
        merged[0] = { ...merged[0], isDefault: true };
    }
    return merged;
}

/**
 * Model-id families returned by the official OpenAI `/models` endpoint that are
 * not chat models (embeddings, audio, image, moderation, legacy completions).
 * Only applied on the official endpoint — custom base URLs (Ollama, vLLM,
 * LiteLLM, LM Studio) list exactly what the user installed, so nothing is
 * filtered there.
 */
const OPENAI_NON_CHAT = /embedding|whisper|tts|dall-e|moderation|realtime|audio|transcribe|image|babbage|davinci|search/i;

export function isOpenAiChatModel(id: string): boolean {
    return !OPENAI_NON_CHAT.test(id);
}

/**
 * Non-chat Gemini model families. The primary filter is the API's
 * `supportedGenerationMethods` (must include `generateContent`), but a few
 * non-conversational models pass that check too, so they are excluded by id.
 */
const GOOGLE_NON_CHAT = /embedding|aqa|imagen|veo|tts/i;

export function isGoogleChatModel(id: string): boolean {
    return !GOOGLE_NON_CHAT.test(id);
}
