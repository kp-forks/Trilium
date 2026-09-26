/**
 * Codex Agent provider — drives OpenAI Codex through its ACP adapter
 * (`codex-acp`, the Agent Client Protocol) as a subprocess. This lets users
 * with a ChatGPT account — Free, Go, Plus, Pro or Business — use the in-app
 * chat without an API key: the adapter signs in with the ChatGPT account and
 * bills the plan's Codex usage.
 *
 * `CODEX_HOME` points the adapter at a directory of Trilium's own, so its
 * sign-in, sessions, MCP servers and skills are Trilium's rather than those of
 * the user's own Codex setup. The session starts in the `read-only` mode, where
 * Codex asks before anything that writes or reaches the network, and the
 * default permission policy denies every such request.
 */

import { LLM_REASONING_EFFORTS, type LlmReasoningEffort } from "@triliumnext/commons";
import type { LlmProviderConfig, ModelInfo } from "@triliumnext/core/src/services/llm/types.js";
import fs from "fs";
import path from "path";

import dataDirs from "../../data_dir.js";
import { AcpAgentProvider, type AcpLaunchSpec, type AcpModel, type AcpNewSessionParams, type AcpSessionModelState, describeError } from "./acp_agent.js";
import { type AcpClient, AcpError } from "./acp_client.js";
import { resolveCodexBinaryPath } from "./codex_binary.js";
import { needsShell } from "./copilot_binary.js";

/** The model id that leaves the session on the model Codex picks. */
const DEFAULT_MODEL_ID = "default";

/**
 * The catalog available without asking the adapter. Codex's line-up moves too
 * fast to name here, so it holds only the entry that defers to Codex's own
 * default.
 */
const AVAILABLE_MODELS: ModelInfo[] = [
    { id: DEFAULT_MODEL_ID, name: "Default", pricing: { input: 0, output: 0 }, isDefault: true, isSubscription: true }
];

/** The adapter's sign-in method for a ChatGPT account; its other one takes an API key, which the OpenAI provider serves. */
const SIGN_IN_METHOD = "chat-gpt";

/** How long the add-provider screen waits for the user to finish signing in in the browser. */
export const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

/** `gpt-6-luna[medium]` → model `gpt-6-luna`, level `medium`. */
const VARIANT_ID = /^(.+)\[([^\]]+)\]$/;

/** `6 Luna (medium)` → `6 Luna`. */
const VARIANT_NAME = /^(.+?) \([^)]+\)$/;

/**
 * What the last catalog Codex reported says about its variants: for each
 * listed model, the effort levels it comes in, and the cheap model for the
 * title turn. Every `session/new` refreshes it.
 */
let catalog: { efforts: Map<string, LlmReasoningEffort[]>; titleModel?: string } = { efforts: new Map() };

export class CodexAgentProvider extends AcpAgentProvider {
    name = "codex-agent";
    protected readonly logLabel = "Codex Agent provider";
    protected readonly fallbackModels = AVAILABLE_MODELS;
    protected readonly defaultModelId = DEFAULT_MODEL_ID;
    protected readonly agentDirName = path.join("codex-agent", "workspace");

    /** Everything Codex does not describe as older or legacy. */
    recommendedModelIds(models: ModelInfo[]): Set<string> {
        return new Set(models.filter(m => !m.isLegacy).map(m => m.id));
    }

    protected titleModelId(): string | undefined {
        return catalog.titleModel;
    }

    protected sessionModelId(model: string, config: LlmProviderConfig): string {
        return resolveCodexModel(model, config.reasoningEffort, catalog.efforts);
    }

    protected async launchSpec(): Promise<AcpLaunchSpec> {
        const binary = await resolveCodexBinaryPath();
        const home = agentHome();
        fs.mkdirSync(home, { recursive: true });
        return {
            binary,
            args: [],
            shell: needsShell(binary),
            env: { CODEX_HOME: home, INITIAL_AGENT_MODE: "read-only" }
        };
    }

    protected buildModelList(remote: AcpSessionModelState): ModelInfo[] {
        recordCatalog(remote);
        return buildCodexModelList(remote);
    }

    /**
     * Open a session, signing in first when Codex has no saved sign-in and the
     * user is on the add-provider screen to complete it. The adapter opens the
     * ChatGPT sign-in page in a browser on the device running Trilium and
     * answers `authenticate` once the user has finished there; it keeps the
     * sign-in under `CODEX_HOME`, so later sessions need none.
     */
    protected async createSession(client: AcpClient, params: AcpNewSessionParams, interactive: boolean, timeoutMs: number) {
        let created: Awaited<ReturnType<AcpAgentProvider["createSession"]>>;
        try {
            created = await super.createSession(client, params, interactive, timeoutMs);
        } catch (err) {
            if (!interactive || !isSignInRequired(err)) {
                throw err;
            }
            await client.request("authenticate", { methodId: SIGN_IN_METHOD }, SIGN_IN_TIMEOUT_MS);
            created = await super.createSession(client, params, interactive, timeoutMs);
        }
        if (created.models) {
            recordCatalog(created.models);
        }
        return created;
    }

    protected describeFailure(error: unknown): string {
        const text = describeError(error);
        if (isSignInRequired(error)) {
            return "OpenAI Codex is not signed in. Open this provider in the AI settings and go to the model selection, which opens the ChatGPT sign-in page in a browser on the device running Trilium.";
        }
        if (/"authenticate" timed out/.test(text)) {
            return "The ChatGPT sign-in was not completed in time. Try again, and finish signing in in the browser window that opens on the device running Trilium.";
        }
        if (/ENOENT|spawn/i.test(text)) {
            return `Failed to start the Codex ACP adapter: ${text}`;
        }
        return text;
    }
}

/**
 * Codex's catalog, led by the entry that defers to its own default, with each
 * model listed once. Codex names an effort level inside the model id
 * (`gpt-6-luna[medium]`), so its variants become one entry, `gpt-6-luna`, that
 * lists the levels as `reasoningEfforts`; {@link resolveCodexModel} picks the
 * variant for a turn. A level Trilium has no name for (`ultra`, which also
 * delegates to sub-agents) is left out. Codex's order is kept: it is the picker
 * Codex itself shows, newest first.
 */
export function buildCodexModelList(remote: AcpSessionModelState): ModelInfo[] {
    const models = groupCodexCatalog(remote).map<ModelInfo>(entry => {
        const common = { pricing: { input: 0, output: 0 }, isSubscription: true, ...(entry.legacy && { isLegacy: true }) };
        if (entry.efforts.length === 0) {
            return { id: entry.id, name: entry.name, ...common };
        }
        return { id: entry.id, name: entry.name, ...common, reasoningEfforts: entry.efforts, defaultReasoningEffort: defaultEffort(entry.efforts) };
    });
    return [ ...AVAILABLE_MODELS, ...models ];
}

/**
 * The real model id for a listed model at an effort level: the variant for
 * that level, the nearest one when the model lacks it (the higher on a tie),
 * or the model's default level without a choice. An id that names no grouped
 * model is returned as it is.
 */
export function resolveCodexModel(model: string, effort: LlmReasoningEffort | undefined, efforts: Map<string, LlmReasoningEffort[]>): string {
    const levels = efforts.get(model);
    if (!levels?.length) {
        return model;
    }
    const wanted = LLM_REASONING_EFFORTS.indexOf(effort ?? defaultEffort(levels));
    let chosen = levels[0];
    for (const level of levels) {
        if (Math.abs(LLM_REASONING_EFFORTS.indexOf(level) - wanted) <= Math.abs(LLM_REASONING_EFFORTS.indexOf(chosen) - wanted)) {
            chosen = level;
        }
    }
    return `${model}[${chosen}]`;
}

/** The catalog's models, variants of one model gathered into one entry. */
function groupCodexCatalog(remote: AcpSessionModelState) {
    const entries = new Map<string, { id: string; name: string; efforts: LlmReasoningEffort[]; legacy: boolean }>();
    for (const model of remote.availableModels ?? []) {
        if (!model.modelId || model.modelId === DEFAULT_MODEL_ID) {
            continue;
        }
        const variant = VARIANT_ID.exec(model.modelId);
        const effort = variant ? asEffort(variant[2]) : undefined;
        if (variant && !effort) {
            continue;
        }
        const id = variant ? variant[1] : model.modelId;
        let entry = entries.get(id);
        if (!entry) {
            entry = { id, name: displayName(id, model), efforts: [], legacy: isLegacy(model) };
            entries.set(id, entry);
        }
        if (effort) {
            entry.efforts.push(effort);
        }
    }
    for (const entry of entries.values()) {
        entry.efforts.sort((a, b) => LLM_REASONING_EFFORTS.indexOf(a) - LLM_REASONING_EFFORTS.indexOf(b));
    }
    return [ ...entries.values() ];
}

/** Remember the variants and the title model of a catalog Codex reported. */
function recordCatalog(remote: AcpSessionModelState) {
    const entries = groupCodexCatalog(remote);
    const efforts = new Map(entries.filter(e => e.efforts.length > 0).map(e => [ e.id, e.efforts ]));
    // The newest model at its lightest level; Codex lists its fast model first.
    const lead = entries.find(e => !e.legacy) ?? entries[0];
    const titleModel = lead && (lead.efforts.length ? `${lead.id}[${lead.efforts[0]}]` : lead.id);
    catalog = { efforts, titleModel };
}

/** `gpt-6-luna` named `6 Luna (medium)` → `GPT-6 Luna`, as Codex's own picker shows it. */
function displayName(id: string, model: AcpModel): string {
    const name = model.name ? (VARIANT_NAME.exec(model.name)?.[1] ?? model.name) : id;
    return /^gpt-/i.test(id) && !/^gpt/i.test(name) ? `GPT-${name}` : name;
}

/** Codex describes the models it keeps for compatibility as `Older …` or `Legacy …`. */
function isLegacy(model: AcpModel): boolean {
    return /^(older|legacy)\b/i.test(model.description ?? "");
}

function asEffort(level: string): LlmReasoningEffort | undefined {
    return (LLM_REASONING_EFFORTS as readonly string[]).includes(level) ? level as LlmReasoningEffort : undefined;
}

/** Medium where the model has it, as Codex itself defaults to it; the lightest otherwise. */
function defaultEffort(sortedEfforts: LlmReasoningEffort[]): LlmReasoningEffort {
    return sortedEfforts.includes("medium") ? "medium" : sortedEfforts[0];
}

/** The adapter's `CODEX_HOME`: its sign-in, sessions and config. */
function agentHome(): string {
    return path.resolve(dataDirs.TRILIUM_DATA_DIR, "codex-agent", "home");
}

function isSignInRequired(error: unknown): boolean {
    return error instanceof AcpError && error.code === -32000 && /authentication required/i.test(error.message);
}

/** For tests: forget the recorded catalog. */
export function resetCodexCatalogForTests(): void {
    catalog = { efforts: new Map() };
}
