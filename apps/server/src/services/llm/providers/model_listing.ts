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
 * The ids pre-selected by default when adding/resetting a provider. Derived
 * purely from the model ids the endpoint returns — no curated list, no
 * hardcoded model names.
 *
 * For OpenAI the recency signal is the version number, across two parallel
 * lines (the GPT line `gpt-<version>` and the reasoning o-series `o<n>`): we
 * recommend only the newest generation of each line, core tiers only — so
 * today's `gpt-5.6-{sol,terra,luna}` and `o4-mini`, not the dozens of older
 * gpt-4 through 5.5 and o1/o3 models (which stay in the picker, unchecked).
 * When gpt-5.7 / o5 ship they win automatically.
 *
 * Other providers fall back to "everything that isn't a preview or legacy".
 */
export function recommendedModelIds(models: RecommendCandidate[], provider: string): Set<string> {
    if (provider === "openai") {
        return openAiRecommendedIds(models);
    }
    return new Set(models.filter(m => !m.isLegacy && !/preview/i.test(m.id)).map(m => m.id));
}

interface RecommendCandidate {
    id: string;
    isLegacy?: boolean;
}

/** Newest generation of each OpenAI line (GPT + o-series), excluding -pro/-chat-latest variants. */
function openAiRecommendedIds(models: RecommendCandidate[]): Set<string> {
    // Premium (`-pro`) and rolling-alias (`-chat-latest`) variants are never a
    // default; drop them before picking the newest generation.
    const core = models.filter(m => !/-pro$/.test(m.id) && !/-chat-latest$/.test(m.id));
    return new Set([
        ...newestOfLine(core, /^gpt-/, gptVersion),
        ...newestOfLine(core, /^o\d/, oSeriesVersion)
    ]);
}

/** Ids in `models` matching `line` whose parsed version equals the line's maximum. */
function newestOfLine(models: RecommendCandidate[], line: RegExp, version: (id: string) => number): string[] {
    const family = models.filter(m => line.test(m.id));
    if (family.length === 0) {
        return [];
    }
    const max = Math.max(...family.map(m => version(m.id)));
    return family.filter(m => version(m.id) === max).map(m => m.id);
}

/** `gpt-5.6-sol` → 5.6, `gpt-4.1` → 4.1, `gpt-4o` → 4. */
function gptVersion(id: string): number {
    const match = /^gpt-(\d+(?:\.\d+)?)/.exec(id);
    return match ? parseFloat(match[1]) : 0;
}

/** `o4-mini` → 4, `o3` → 3. */
function oSeriesVersion(id: string): number {
    const match = /^o(\d+)/.exec(id);
    return match ? parseInt(match[1], 10) : 0;
}
