/**
 * Codex Agent provider — drives the user's own Codex CLI through the ACP
 * adapter Trilium ships (`codex-acp`, the Agent Client Protocol), which runs in
 * a worker thread and starts `codex app-server` (see codex_binary.ts). This
 * lets users with a ChatGPT account — Free, Go, Plus, Pro or Business — use the
 * in-app chat without an API key: Codex signs in with the ChatGPT account and
 * bills the plan's Codex usage.
 *
 * `CODEX_HOME` points Codex at a directory of Trilium's own, so its
 * sign-in, sessions, MCP servers and skills are Trilium's rather than those of
 * the user's own Codex setup. A `PreToolUse` hook lets through only Trilium's
 * note tools and, in a chat that allows it, the web search (see codex_hook.ts).
 * Behind it, the session starts in the `read-only` mode, where Codex asks
 * before anything that writes, and {@link decideCodexPermission} approves only
 * calls to Trilium's note tools.
 */

import { LLM_REASONING_EFFORTS, type LlmCitation, type LlmMessage, type LlmReasoningEffort, type LlmStreamChunk } from "@triliumnext/commons";
import type { LlmProviderConfig, ModelInfo } from "@triliumnext/core/src/services/llm/types.js";
import path from "path";

import dataDirs from "../../data_dir.js";
import { AcpAgentProvider, type AcpLaunchSpec, type AcpModel, type AcpNewSessionParams, type AcpPermissionOutcome, type AcpPermissionRequest, type AcpSessionModelState, type AcpToolCallUpdate, type BuiltInToolDisplay, denyPermission, describeError, NOTE_TOOLS_MCP_SERVER_NAME } from "./acp_agent.js";
import { type AcpClient, AcpError } from "./acp_client.js";
import { getAcpHookEndpointUrl } from "./acp_mcp_endpoint.js";
import { buildHookCommand, resolveCurlPath } from "./antigravity_hook.js";
import { resolveCodexAcpScript, resolveCodexBinaryPath } from "./codex_binary.js";
import { buildCodexHookCommand, type CodexHookAnswer, codexSearchSources, decideCodexToolCall, writeCodexHooks } from "./codex_hook.js";

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

/**
 * The settings the adapter merges into every session, as `CODEX_CONFIG`.
 * Codex runs a hook only once the user has trusted it, which no one can do in
 * Trilium's own `CODEX_HOME`; `features.hooks` keeps the hook running should
 * the feature's default change.
 */
const CODEX_CONFIG = { bypass_hook_trust: true, features: { hooks: true } };

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

/**
 * The sources each chat turn's web searches returned, by the id the model cites
 * them with, keyed by the turn's configuration: the object the pool attaches to
 * the turn's session, which the hook finds by session id.
 */
const sourcesByTurn = new WeakMap<LlmProviderConfig, Map<string, LlmCitation>>();

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
        const [ codex, curl, hookUrl ] = await Promise.all([
            resolveCodexBinaryPath(),
            resolveCurlPath(),
            getAcpHookEndpointUrl("codex", payload => this.answerHook(payload))
        ]);
        const home = agentHome();
        writeCodexHooks(home, buildCodexHookCommand(curl, hookUrl), buildHookCommand(curl, hookUrl));
        return {
            binary: resolveCodexAcpScript(),
            args: [],
            worker: true,
            env: {
                CODEX_PATH: codex,
                CODEX_HOME: home,
                INITIAL_AGENT_MODE: "read-only",
                CODEX_CONFIG: JSON.stringify(CODEX_CONFIG)
            }
        };
    }

    protected buildModelList(remote: AcpSessionModelState): ModelInfo[] {
        recordCatalog(remote);
        return buildCodexModelList(remote);
    }

    protected decidePermission(
        request: AcpPermissionRequest,
        _config?: LlmProviderConfig,
        mcpServerOf?: (toolCallId: string | undefined) => string | undefined
    ): AcpPermissionOutcome {
        return decideCodexPermission(request, this.logLabel, mcpServerOf);
    }

    /** The adapter reports each MCP server's startup as a tool call of its own, `mcp_startup.<server>`. */
    protected isInternalToolCall(update: AcpToolCallUpdate): boolean {
        return update.toolCallId?.startsWith("mcp_startup.") ?? false;
    }

    /**
     * The web search, under the name the other providers' searches carry, with
     * its query or the page it opens, where the chat looks for a detail. The
     * adapter announces a search with the kind `search` and an empty query, and
     * reports the query only in later updates, which carry no kind.
     */
    protected describeBuiltInTool(update: AcpToolCallUpdate): BuiltInToolDisplay | undefined {
        const input = update.rawInput as { type?: unknown; query?: unknown; action?: { type?: unknown; url?: unknown } | null } | undefined;
        if (update.kind !== "search" && input?.type !== "webSearch") {
            return undefined;
        }
        if (input?.action?.type === "openPage" && typeof input.action.url === "string") {
            return { toolName: "web_search", toolInput: { url: input.action.url } };
        }
        return { toolName: "web_search", toolInput: typeof input?.query === "string" && input.query ? { query: input.query } : {} };
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

    /** The turn, with the citation markers Codex writes into its reply taken out (see {@link CitationStripper}). */
    async *chatChunks(messages: LlmMessage[], config: LlmProviderConfig, signal?: AbortSignal): AsyncIterable<LlmStreamChunk> {
        const citations = new CitationStripper();
        for await (const chunk of super.chatChunks(messages, config, signal)) {
            if (chunk.type !== "text") {
                yield chunk;
                continue;
            }
            const { text, refs } = citations.push(chunk.content);
            if (text) {
                yield { ...chunk, content: text };
            }
            for (const ref of refs) {
                const citation = sourcesByTurn.get(config)?.get(ref);
                if (citation) {
                    yield { type: "citation", citation };
                }
            }
        }
    }

    /**
     * Answer the hook: decide a tool call before it runs, and after a web search
     * remember its sources for the turn, which the citations in the reply name.
     */
    private answerHook(payload: unknown): Promise<CodexHookAnswer> | CodexHookAnswer {
        const search = codexSearchSources(payload);
        if (!search) {
            return decideCodexToolCall(payload, sessionId => this.turnConfigOf(sessionId));
        }
        const config = this.turnConfigOf(search.sessionId);
        if (config) {
            const known = sourcesByTurn.get(config) ?? new Map<string, LlmCitation>();
            for (const [ ref, citation ] of search.sources) {
                known.set(ref, citation);
            }
            sourcesByTurn.set(config, known);
        }
        return {};
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
            return `Failed to start Codex: ${text}`;
        }
        return text;
    }
}

/**
 * Approve once a call to Trilium's note tools; deny everything else.
 *
 * Codex asks before running an MCP tool that is not marked read-only, and the
 * adapter forwards that as a permission request marked
 * `_meta.is_mcp_tool_approval`. The request carries only the id of the tool
 * call, which the adapter announced just before with its server in `rawInput`,
 * so the server is looked up with `mcpServerOf`. When several calls to one
 * server wait at once, the adapter cannot tell which one is asking and names
 * the server in `toolCall.rawInput.serverName` instead. Codex fills in both,
 * not the model.
 */
export function decideCodexPermission(
    request: AcpPermissionRequest,
    logLabel: string,
    mcpServerOf?: (toolCallId: string | undefined) => string | undefined
): AcpPermissionOutcome {
    const toolCall = request.toolCall;
    const standaloneServer = (toolCall?.rawInput as { serverName?: unknown } | undefined)?.serverName;
    const server = mcpServerOf?.(toolCall?.toolCallId) ?? standaloneServer;
    const allowOnce = request.options?.find(o => o.kind === "allow_once");
    if (request._meta?.is_mcp_tool_approval === true && server === NOTE_TOOLS_MCP_SERVER_NAME && allowOnce) {
        return { outcome: { outcome: "selected", optionId: allowOnce.optionId } };
    }
    return denyPermission(request, logLabel);
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

/** A citation marker opens with U+E200, separates its parts with U+E202 and closes with U+E201, private-use characters. */
const MARKER_START = "\uE200";
const MARKER_SEPARATOR = "\uE202";
const COMPLETE_MARKER = /\uE200[^\uE201]*\uE201/g;

/** Longer than any citation marker; an opening held back past it was no marker. */
const MAX_MARKER_LENGTH = 200;

/**
 * Removes the citation markers OpenAI's models write after a web search,
 * `U+E200 cite U+E202 turn3search2 U+E201`, from streamed text, and reports the
 * search results they cite, which {@link CodexAgentProvider.chatChunks} turns into
 * Trilium citations. Left in, the chat would show them as `citeturn3search2`. A
 * marker can span chunks, so text from an unclosed one is held back until it
 * closes, and dropped if it never does.
 */
export class CitationStripper {
    private pending = "";

    /** The text of `chunk` that is safe to show now, and the search results the removed markers cite. */
    push(chunk: string): { text: string; refs: string[] } {
        const refs: string[] = [];
        let text = (this.pending + chunk).replace(COMPLETE_MARKER, marker => {
            const [ kind, ...ids ] = marker.slice(1, -1).split(MARKER_SEPARATOR);
            if (kind === "cite") {
                refs.push(...ids);
            }
            return "";
        });
        let open = text.indexOf(MARKER_START);
        if (open >= 0 && text.length - open > MAX_MARKER_LENGTH) {
            text = text.replaceAll(MARKER_START, "");
            open = -1;
        }
        this.pending = open >= 0 ? text.slice(open) : "";
        return { text: open >= 0 ? text.slice(0, open) : text, refs };
    }
}

/** For tests: forget the recorded catalog. */
export function resetCodexCatalogForTests(): void {
    catalog = { efforts: new Map() };
}
