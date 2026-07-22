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
 * not chat models (embeddings, audio/speech, image, video, moderation,
 * computer-use, coding agents, legacy completions). Only applied on the
 * official endpoint — custom base URLs (Ollama, vLLM, LiteLLM, LM Studio) list
 * exactly what the user installed, so nothing is filtered there.
 */
const OPENAI_NON_CHAT = /embedding|whisper|tts|dall-e|moderation|realtime|audio|transcribe|image|sora|computer-use|codex|instruct|deep-research|babbage|davinci|search/i;

/**
 * Pinned-snapshot suffixes that duplicate a rolling base id — `-2024-05-13`
 * (dated) and `-0125` / `-1106` (legacy MMDD). Dropped so the list shows
 * `gpt-4o`, not `gpt-4o` plus five of its dated revisions.
 */
const OPENAI_SNAPSHOT = /-\d{4}(-\d{2}-\d{2})?$/;

export function isOpenAiChatModel(id: string): boolean {
    // `chat-latest` is a bare rolling alias (current ChatGPT Instant model) —
    // redundant with the versioned `gpt-*-chat-latest` handles and uninformative
    // on its own, so it's dropped.
    return id !== "chat-latest" && !OPENAI_NON_CHAT.test(id) && !OPENAI_SNAPSHOT.test(id);
}

/**
 * Friendly display name for an OpenAI model id, since the `/models` endpoint
 * returns none. Only the GPT family is reshaped — `gpt-4.1-mini` →
 * "GPT-4.1 Mini", `gpt-5.6-sol` → "GPT-5.6 Sol". The o-series keeps OpenAI's
 * canonical lowercase-hyphenated form (`o4-mini`, `o1-pro`), which is both its
 * proper style and what keeps it visually distinct from "GPT-4o Mini".
 * Non-OpenAI ids (self-hosted `llama3.2`) are left untouched.
 */
export function openAiModelName(id: string): string {
    const gptMatch = /^gpt-([^-]+)(?:-(.+))?$/.exec(id);
    if (!gptMatch) {
        return id;
    }
    const [, version, suffix] = gptMatch;
    const suffixName = suffix
        ? ` ${suffix.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")}`
        : "";
    return `GPT-${version}${suffixName}`;
}

/**
 * Chat-model filter for the Gemini API. The endpoint's `supportedGenerationMethods`
 * is not enough: image (Nano Banana), robotics, computer-use, and speech models
 * all advertise `generateContent` too. Filter by id shape instead:
 *
 * - Only `gemini-*` ids are chat candidates — this drops the non-Gemini
 *   families wholesale (`lyria-*` music, `veo-*` video, `imagen-*`, `gemma-*`
 *   open models, `deep-research-*`, `antigravity-*` agents, embeddings, AQA).
 * - Within `gemini-*`, drop non-conversational variants by token: image
 *   generation, speech (tts/live/native-audio), video (omni), robotics,
 *   computer use, embeddings, and tool-variant builds (custom-tools).
 * - Drop `-latest` rolling aliases and `-NNN` pinned revisions — both are
 *   duplicates of a stable id that is also in the list.
 */
const GOOGLE_NON_CHAT = /image|tts|live|audio|dialog|robotics|computer-use|embedding|omni|custom-?tools/i;

export function isGoogleChatModel(id: string): boolean {
    return /^gemini-/.test(id)
        && !GOOGLE_NON_CHAT.test(id)
        && !/-latest$/.test(id)
        && !/-\d{3}$/.test(id);
}

/**
 * Whether a model should be pre-selected by default when adding/resetting a
 * provider. Legacy models are never recommended; per-provider tweaks refine it
 * further — for Google, preview models are excluded so only the stable line-up
 * is suggested (the user can still tick previews manually).
 */
export function isRecommendedByDefault(model: { id: string; isLegacy?: boolean }, provider: string): boolean {
    if (model.isLegacy) {
        return false;
    }
    if (provider === "google" && /preview/i.test(model.id)) {
        return false;
    }
    return true;
}
