/**
 * Claude Agent provider — drives the Claude Agent SDK (Claude Code as a
 * subprocess) instead of calling the Anthropic API directly. This lets users
 * with a Claude Pro/Max subscription use the in-app chat without an API key:
 * authentication is owned entirely by Claude Code (`claude /login` once on the
 * machine running the server), and billing goes to the subscription.
 *
 * Unlike the AI-SDK providers, the Agent SDK runs its own agentic loop and is
 * session-based (it owns conversation history). This provider therefore:
 *   - implements `chatChunks()` (chunk-native streaming) instead of `chat()`,
 *   - maps chat notes to agent sessions and sends only the newest user message
 *     when the transcript still matches (`resume`), falling back to seeding a
 *     fresh session from the transcript when it diverged or was lost,
 *   - exposes note tools by pointing the agent at Trilium's own MCP server,
 *     with every built-in Claude Code tool (file access, bash, …) disabled.
 */

import { type Options as AgentOptions, query, type SDKAssistantMessage, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { LlmMessage, LlmMessagePart, LlmStreamChunk } from "@triliumnext/commons";
import { getLog, options as optionService } from "@triliumnext/core";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

import dataDirs from "../../data_dir.js";
import port from "../../port.js";
import type { LlmProvider, LlmProviderConfig, ModelInfo, ModelPricing, StreamResult } from "../types.js";
import { buildModelList } from "./base_provider.js";
import { buildNoteHint } from "./note_hint.js";
import { buildSystemPrompt } from "./system_prompt.js";

/**
 * Models offered under a Claude subscription. Pricing is zero because usage is
 * covered by the subscription — the per-turn `usage` chunk still reports the
 * API-equivalent cost as informational metadata from the agent's result.
 */
const { models: AVAILABLE_MODELS, pricing: MODEL_PRICING } = buildModelList([
    {
        id: "claude-fable-5",
        name: "Claude Fable 5 (subscription)",
        pricing: { input: 0, output: 0 },
        contextWindow: 1000000
    },
    {
        id: "claude-sonnet-5",
        name: "Claude Sonnet 5 (subscription)",
        pricing: { input: 0, output: 0 },
        contextWindow: 1000000,
        isDefault: true
    },
    {
        id: "claude-opus-4-8",
        name: "Claude Opus 4.8 (subscription)",
        pricing: { input: 0, output: 0 },
        contextWindow: 1000000
    },
    {
        id: "claude-haiku-4-5-20251001",
        name: "Claude Haiku 4.5 (subscription)",
        pricing: { input: 0, output: 0 },
        contextWindow: 200000
    }
]);

const TITLE_MODEL = "claude-haiku-4-5-20251001";

/** Upper bound on assistant↔tool round-trips within one chat turn. */
const MAX_TURNS = 25;

/** Session mappings kept per chat note; bounded to avoid unbounded growth. */
const MAX_TRACKED_SESSIONS = 200;

interface SessionEntry {
    sessionId: string;
    /** Hash of the transcript as it stood when the session last responded. */
    transcriptHash: string;
}

/**
 * chatNoteId → agent session. In-memory only: agent sessions live on this
 * host (under ~/.claude), so the mapping must not sync across devices. Losing
 * it (e.g. on restart) is fine — the provider reseeds a fresh session from
 * the transcript the client sends.
 */
const sessionsByChatNote = new Map<string, SessionEntry>();

function rememberSession(chatNoteId: string, entry: SessionEntry) {
    // Refresh insertion order so the oldest mapping is evicted first.
    sessionsByChatNote.delete(chatNoteId);
    sessionsByChatNote.set(chatNoteId, entry);
    if (sessionsByChatNote.size > MAX_TRACKED_SESSIONS) {
        const oldest = sessionsByChatNote.keys().next().value;
        if (oldest !== undefined) {
            sessionsByChatNote.delete(oldest);
        }
    }
}

export class ClaudeAgentProvider implements LlmProvider {
    name = "claude-agent";

    getModelPricing(model: string): ModelPricing | undefined {
        return MODEL_PRICING[model];
    }

    getAvailableModels(): ModelInfo[] {
        return AVAILABLE_MODELS;
    }

    /** Not used — the route prefers {@link chatChunks} when implemented. */
    chat(): StreamResult {
        throw new Error("The Claude Agent provider streams chunks directly; use chatChunks().");
    }

    async *chatChunks(messages: LlmMessage[], config: LlmProviderConfig, signal?: AbortSignal): AsyncIterable<LlmStreamChunk> {
        const conversation = messages.filter(m => m.role !== "system");
        const lastMessage = conversation[conversation.length - 1];
        if (!lastMessage || lastMessage.role !== "user") {
            yield { type: "error", error: "The last message must be a user message." };
            return;
        }

        const history = conversation.slice(0, -1);
        const historyHash = hashTranscript(history);

        // Prepend the current-note metadata hint to *this* user message (not the
        // stored transcript), mirroring the AI-SDK providers' applyNoteHint. It's
        // volatile context — kept out of the hash so a later turn's unhinted
        // transcript still matches and can resume.
        const hasAttachments = Array.isArray(lastMessage.content) && lastMessage.content.some(p => p.type !== "text");
        const noteHint = config.contextNoteId ? buildNoteHint(config.contextNoteId, hasAttachments) : null;
        const lastText = flattenContent(lastMessage.content);
        const currentMessage = noteHint ? `${noteHint}\n\n${lastText}` : lastText;

        // Resume the existing agent session only when the transcript the client
        // sent still matches what that session last saw; any divergence (edited
        // history, lost mapping, server restart) reseeds a fresh session.
        const stored = config.chatNoteId ? sessionsByChatNote.get(config.chatNoteId) : undefined;
        const resume = stored && stored.transcriptHash === historyHash ? stored.sessionId : undefined;
        const prompt = (resume || history.length === 0)
            ? currentMessage
            : buildSeededPrompt(history, currentMessage);

        const abortController = new AbortController();
        const onAbort = () => abortController.abort();
        signal?.addEventListener("abort", onAbort, { once: true });

        const model = config.model || AVAILABLE_MODELS.find(m => m.isDefault)?.id;
        let sessionId: string | undefined;
        let assistantText = "";
        // tool_use id → name, for labelling results; also serves as the guard
        // that only results belonging to *this* turn's tool calls are emitted.
        const toolNamesById = new Map<string, string>();
        // streaming block index → tool_use id, for input-delta attribution
        const toolIdsByBlockIndex = new Map<number, string>();

        try {
            const response = query({
                prompt,
                options: {
                    ...this.buildBaseOptions(config),
                    systemPrompt: this.composeSystemPrompt(messages, config),
                    model,
                    resume,
                    includePartialMessages: true,
                    maxTurns: MAX_TURNS,
                    abortController
                }
            });

            for await (const message of response) {
                sessionId = takeSessionId(message) ?? sessionId;

                switch (message.type) {
                    case "stream_event": {
                        if (message.parent_tool_use_id !== null) {
                            break; // subagent traffic — not part of the visible reply
                        }
                        const event = message.event;
                        if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
                            toolIdsByBlockIndex.set(event.index, event.content_block.id);
                            toolNamesById.set(event.content_block.id, event.content_block.name);
                            yield {
                                type: "tool_input_start",
                                toolCallId: event.content_block.id,
                                toolName: friendlyToolName(event.content_block.name)
                            };
                        } else if (event.type === "content_block_delta") {
                            if (event.delta.type === "text_delta") {
                                assistantText += event.delta.text;
                                yield { type: "text", content: event.delta.text };
                            } else if (event.delta.type === "thinking_delta") {
                                yield { type: "thinking", content: event.delta.thinking };
                            } else if (event.delta.type === "input_json_delta") {
                                const toolCallId = toolIdsByBlockIndex.get(event.index);
                                if (toolCallId) {
                                    yield { type: "tool_input_delta", toolCallId, delta: event.delta.partial_json };
                                }
                            }
                        }
                        break;
                    }

                    case "assistant": {
                        if (message.parent_tool_use_id !== null) {
                            break;
                        }
                        const authError = describeAssistantError(message);
                        if (authError) {
                            yield { type: "error", error: authError };
                            break;
                        }
                        // Text/thinking already streamed via stream_events; only
                        // the completed tool calls are emitted from the full message.
                        for (const block of message.message.content) {
                            if (block.type === "tool_use") {
                                toolNamesById.set(block.id, block.name);
                                yield {
                                    type: "tool_use",
                                    toolCallId: block.id,
                                    toolName: friendlyToolName(block.name),
                                    toolInput: (block.input ?? {}) as Record<string, unknown>
                                };
                            }
                        }
                        break;
                    }

                    case "user": {
                        if (message.parent_tool_use_id !== null) {
                            break;
                        }
                        const content = message.message.content;
                        if (!Array.isArray(content)) {
                            break;
                        }
                        for (const block of content) {
                            // Only surface results for tool calls made this turn —
                            // this also filters any replayed history on resume.
                            if (block.type === "tool_result" && block.tool_use_id && toolNamesById.has(block.tool_use_id)) {
                                yield {
                                    type: "tool_result",
                                    toolCallId: block.tool_use_id,
                                    toolName: friendlyToolName(toolNamesById.get(block.tool_use_id) ?? "tool"),
                                    result: flattenToolResult(block.content),
                                    isError: block.is_error === true
                                };
                            }
                        }
                        break;
                    }

                    case "result": {
                        if (message.subtype !== "success") {
                            const errors = "errors" in message && message.errors.length > 0
                                ? message.errors.join("; ")
                                : `Agent stopped: ${message.subtype}`;
                            yield { type: "error", error: errors };
                        }
                        yield {
                            type: "usage",
                            usage: {
                                promptTokens: message.usage.input_tokens,
                                completionTokens: message.usage.output_tokens,
                                totalTokens: message.usage.input_tokens + message.usage.output_tokens,
                                // API-equivalent cost; informational under a subscription.
                                cost: message.total_cost_usd,
                                model
                            }
                        };
                        break;
                    }

                    default:
                        break;
                }
            }

            if (config.chatNoteId && sessionId) {
                rememberSession(config.chatNoteId, {
                    sessionId,
                    transcriptHash: hashTranscript([
                        ...conversation,
                        { role: "assistant", content: assistantText }
                    ])
                });
            }

            yield { type: "done" };
        } catch (error) {
            yield { type: "error", error: describeAgentError(error) };
        } finally {
            signal?.removeEventListener("abort", onAbort);
            abortController.abort();
        }
    }

    async generateTitle(firstMessage: string): Promise<string> {
        try {
            const response = query({
                prompt: `Generate a short title (at most 5 words) summarizing this chat message. Reply with only the title, no quotes or punctuation around it:\n\n${firstMessage.substring(0, 500)}`,
                options: {
                    ...this.buildBaseOptions({ enableNoteTools: false }),
                    systemPrompt: "You generate short, descriptive titles. Reply with only the title text — no quotes, no punctuation around it.",
                    model: TITLE_MODEL,
                    maxTurns: 1,
                    persistSession: false
                }
            });

            for await (const message of response) {
                if (message.type === "result" && message.subtype === "success") {
                    return message.result.trim().replace(/^["']|["']$/g, "").substring(0, 100);
                }
            }
        } catch (error) {
            getLog().error(`Claude Agent title generation failed: ${describeAgentError(error)}`);
        }
        return "";
    }

    /**
     * Build the same Trilium system prompt the AI-SDK providers use (skill
     * guidance, [[noteId]] links, Markdown-rendering capabilities), reflecting
     * this path's *actual* tool availability.
     */
    private composeSystemPrompt(messages: LlmMessage[], config: LlmProviderConfig): string {
        const noteToolsAvailable = areNoteToolsAvailable(config);

        // The shared prompt promises note tools whenever `enableNoteTools` is
        // set — but on this path they only exist if MCP is also on, so gate on
        // the effective availability. `contextNoteId` passes through: chatChunks
        // injects the note metadata into the user turn (see buildNoteHint), so
        // the "you can see the current note's metadata above" notice is accurate.
        const promptConfig: LlmProviderConfig = { ...config, enableNoteTools: noteToolsAvailable };
        let systemPrompt = buildSystemPrompt(messages, promptConfig) ?? "";

        // Note tools were requested but unavailable — tell the model why so it
        // explains the fix instead of guessing at its lack of note access.
        if (config.enableNoteTools !== false && !noteToolsAvailable) {
            systemPrompt += "\n\nNote tools are currently unavailable because Trilium's MCP server is turned off. If the user asks about their notes, tell them to enable the MCP server in Options → AI / LLM and start a new message.";
        }

        return systemPrompt;
    }

    /** Options shared by every agent invocation, independent of the turn. */
    private buildBaseOptions(config: Pick<LlmProviderConfig, "enableNoteTools" | "enableWebSearch">): AgentOptions {
        // Built-in Claude Code tools (file access, bash, …) stay disabled — the
        // agent runs on the server host and must only ever touch notes. Web
        // search is the one opt-in exception.
        const builtinTools = config.enableWebSearch ? ["WebSearch", "WebFetch"] : [];
        const allowedTools = [...builtinTools];

        const options: AgentOptions = {
            cwd: getAgentCwd(),
            tools: builtinTools,
            settingSources: [],
            strictMcpConfig: true,
            permissionMode: "dontAsk"
        };

        if (areNoteToolsAvailable(config)) {
            options.mcpServers = {
                trilium: {
                    type: "http",
                    url: `http://127.0.0.1:${port}/mcp`,
                    alwaysLoad: true
                }
            };
            // Bare server prefix auto-allows every tool from that server.
            allowedTools.push("mcp__trilium");
        } else if (config.enableNoteTools !== false) {
            getLog().info("Claude Agent provider: note tools requested but the MCP server is disabled — enable it in Options → AI / LLM to let the agent access notes.");
        }

        options.allowedTools = allowedTools;
        return options;
    }
}

/**
 * Note tools are available on this path only when the chat requested them AND
 * Trilium's MCP server (which exposes them) is enabled. Both the tool wiring
 * and the system prompt gate on this so they never disagree.
 */
function areNoteToolsAvailable(config: Pick<LlmProviderConfig, "enableNoteTools">): boolean {
    return config.enableNoteTools !== false && optionService.getOptionOrNull("mcpEnabled") === "true";
}

/**
 * Directory the agent subprocess runs in. Claude Code keys its on-disk session
 * storage by cwd, so a stable, dedicated directory keeps Trilium's sessions
 * grouped and away from any real project.
 */
let agentCwd: string | undefined;
function getAgentCwd(): string {
    if (!agentCwd) {
        // Resolve to an absolute path — TRILIUM_DATA_DIR may be relative (dev
        // runs use TRILIUM_DATA_DIR=data) and a relative spawn cwd would move
        // with the server process's own cwd.
        agentCwd = path.resolve(dataDirs.TRILIUM_DATA_DIR, "claude-agent");
        fs.mkdirSync(agentCwd, { recursive: true });

        // Claude Code resolves its "project" by walking up to the nearest git
        // root. If the data dir sits inside a repository (again, the dev-run
        // case), the agent inherits that repo's project state: its .mcp.json
        // approval list (a `disabledMcpjsonServers: ["trilium"]` entry silently
        // disables our MCP server by name), its CLAUDE.md, and its auto-memory
        // — none of which belong in a notes chat. A .git marker makes the agent
        // directory its own project root, isolating it from any enclosing repo.
        const gitMarker = path.join(agentCwd, ".git");
        if (!fs.existsSync(gitMarker)) {
            fs.mkdirSync(path.join(gitMarker, "objects"), { recursive: true });
            fs.mkdirSync(path.join(gitMarker, "refs"), { recursive: true });
            fs.writeFileSync(path.join(gitMarker, "HEAD"), "ref: refs/heads/main\n");
        }
    }
    return agentCwd;
}

/** Flatten possibly-multimodal message content to plain text. */
function flattenContent(content: string | LlmMessagePart[]): string {
    if (typeof content === "string") {
        return content;
    }
    return content
        .map(part => {
            if (part.type === "text") {
                return part.text;
            }
            // Attachment parts are resolved server-side for API providers; the
            // agent path is text-only for now.
            return `[attached ${part.type === "image" ? "image" : "file"}${"filename" in part ? `: ${part.filename}` : ""}]`;
        })
        .join("\n");
}

/**
 * Stable hash of a transcript (roles + text only). Used to detect whether the
 * history the client sent still matches what the mapped agent session saw.
 */
export function hashTranscript(messages: LlmMessage[]): string {
    const normalized = messages.map(m => [m.role, flattenContent(m.content).trim()]);
    return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

/**
 * First prompt of a reseeded session: replays the retained transcript as
 * context so the agent can continue a conversation whose session was lost or
 * diverged (edited history, server restart).
 */
export function buildSeededPrompt(history: LlmMessage[], lastText: string): string {
    const transcript = history
        .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${flattenContent(m.content)}`)
        .join("\n\n");
    return `<conversation_history>\nThis is the prior conversation between the user and you. Continue it naturally; do not mention this replay.\n\n${transcript}\n</conversation_history>\n\n${lastText}`;
}

/** Strip the MCP prefix so the client shows "search_notes", not "mcp__trilium__search_notes". */
function friendlyToolName(name: string): string {
    return name.replace(/^mcp__trilium__/, "");
}

function flattenToolResult(content: unknown): string {
    if (typeof content === "string") {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .map(block => (block && typeof block === "object" && "text" in block ? String(block.text) : ""))
            .filter(Boolean)
            .join("\n");
    }
    return content == null ? "" : JSON.stringify(content);
}

function takeSessionId(message: SDKMessage): string | undefined {
    return "session_id" in message && typeof message.session_id === "string" ? message.session_id : undefined;
}

/** Map SDK-level assistant errors to actionable messages. */
function describeAssistantError(message: SDKAssistantMessage): string | undefined {
    if (!message.error) {
        return undefined;
    }
    if (message.error === "authentication_failed" || message.error === "oauth_org_not_allowed") {
        return "Claude Code is not authenticated. Run `claude /login` on the machine running the Trilium server to sign in with your Claude subscription (or an API key).";
    }
    return `Claude Agent error: ${message.error}`;
}

function describeAgentError(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error);
    if (/ENOENT|spawn/i.test(text)) {
        return `Failed to start Claude Code: ${text}`;
    }
    return text;
}
