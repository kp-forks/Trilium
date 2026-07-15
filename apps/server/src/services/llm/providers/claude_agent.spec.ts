import type { LlmStreamChunk } from "@triliumnext/commons";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const errorLogMock = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
    query: queryMock
}));

vi.mock("@triliumnext/core", () => ({
    getLog: () => ({ info: vi.fn(), error: errorLogMock }),
    // buildSystemPrompt (reached via composeSystemPrompt) reads the workspace
    // task states; no custom states in this unit test.
    task_states: { getTaskStates: () => [] }
}));

// In-process MCP: the provider hands the agent Trilium's own MCP server
// instance; stub the factory so tests don't build the real tool registry.
const createMcpServerMock = vi.hoisted(() => vi.fn(() => ({ mcpServerInstance: true })));
vi.mock("../../mcp/mcp_server.js", () => ({ createMcpServer: createMcpServerMock }));

vi.mock("../../data_dir.js", async () => {
    const os = await import("os");
    const path = await import("path");
    return { default: { TRILIUM_DATA_DIR: path.join(os.tmpdir(), "trilium-claude-agent-spec") } };
});

vi.mock("../../port.js", () => ({ default: 8080 }));

const buildNoteHintMock = vi.hoisted(() => vi.fn((noteId: string): string | null => `NOTE_META(${noteId})`));
vi.mock("./note_hint.js", () => ({ buildNoteHint: buildNoteHintMock }));

// BYO binary resolution shells out to the user's `claude`; stub it so tests
// don't depend on a real install. Resolves a path by default; can be made to
// reject (missing binary) per-test.
const resolveClaudeBinaryMock = vi.hoisted(() => vi.fn(async () => "/usr/bin/claude"));
vi.mock("./claude_binary.js", () => ({ resolveClaudeBinaryPath: resolveClaudeBinaryMock }));

// Attachment resolution reads bytes out of Becca, which the core mock above
// omits — stub it so the multimodal tests drive block construction directly.
const resolveAttachmentPartMock = vi.hoisted(() => vi.fn());
vi.mock("./attachment_content.js", () => ({ resolveAttachmentPart: resolveAttachmentPartMock }));

const { buildSeededPrompt, ClaudeAgentProvider, hashTranscript } = await import("./claude_agent.js");

/** Drain the query prompt into the single user message it streams (multimodal path). */
async function drainPrompt(prompt: unknown): Promise<{ role: string; content: unknown[] }> {
    const iterator = (prompt as AsyncIterable<unknown>)?.[Symbol.asyncIterator];
    if (typeof prompt === "string" || typeof iterator !== "function") {
        throw new Error("expected a streamed multimodal prompt, got a plain string");
    }
    const messages: { message: { role: string; content: unknown[] } }[] = [];
    for await (const message of prompt as AsyncIterable<{ message: { role: string; content: unknown[] } }>) {
        messages.push(message);
    }
    expect(messages).toHaveLength(1);
    return messages[0].message;
}

/** Make query() replay the given SDK messages and record its invocation. */
function scriptAgent(messages: unknown[]) {
    queryMock.mockImplementation(() => (async function* () {
        for (const message of messages) {
            yield message;
        }
    })());
}

async function collect(iterable: AsyncIterable<LlmStreamChunk>): Promise<LlmStreamChunk[]> {
    const chunks: LlmStreamChunk[] = [];
    for await (const chunk of iterable) {
        chunks.push(chunk);
    }
    return chunks;
}

function textDelta(text: string) {
    return {
        type: "stream_event",
        parent_tool_use_id: null,
        session_id: "sess-1",
        event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }
    };
}

function successResult(sessionId = "sess-1") {
    return {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "ok",
        session_id: sessionId,
        total_cost_usd: 0.05,
        usage: { input_tokens: 100, output_tokens: 40 }
    };
}

describe("ClaudeAgentProvider.chatChunks", () => {
    beforeEach(() => {
        queryMock.mockReset();
        errorLogMock.mockReset();
        createMcpServerMock.mockClear(); // clear calls, keep the instance impl
        resolveAttachmentPartMock.mockReset();
    });

    it("maps stream events, tool calls, results, and usage to chunks in order", async () => {
        scriptAgent([
            { type: "system", subtype: "init", session_id: "sess-1" },
            textDelta("Hello "),
            {
                type: "stream_event",
                parent_tool_use_id: null,
                session_id: "sess-1",
                event: {
                    type: "content_block_start",
                    index: 1,
                    content_block: { type: "tool_use", id: "toolu_1", name: "mcp__trilium__search_notes" }
                }
            },
            {
                type: "stream_event",
                parent_tool_use_id: null,
                session_id: "sess-1",
                event: { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"query":' } }
            },
            {
                type: "assistant",
                parent_tool_use_id: null,
                session_id: "sess-1",
                message: {
                    content: [
                        { type: "text", text: "Hello " },
                        { type: "tool_use", id: "toolu_1", name: "mcp__trilium__search_notes", input: { query: "x" } }
                    ]
                }
            },
            {
                type: "user",
                parent_tool_use_id: null,
                session_id: "sess-1",
                message: {
                    content: [
                        { type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: "3 notes found" }] },
                        // A result for an unknown (e.g. replayed) tool call must be dropped.
                        { type: "tool_result", tool_use_id: "toolu_stale", content: "old" }
                    ]
                }
            },
            textDelta("world"),
            successResult()
        ]);

        const provider = new ClaudeAgentProvider();
        const chunks = await collect(provider.chatChunks([{ role: "user", content: "hi" }], {}));

        expect(chunks).toEqual([
            { type: "text", content: "Hello " },
            { type: "tool_input_start", toolCallId: "toolu_1", toolName: "search_notes" },
            { type: "tool_input_delta", toolCallId: "toolu_1", delta: '{"query":' },
            { type: "tool_use", toolCallId: "toolu_1", toolName: "search_notes", toolInput: { query: "x" } },
            { type: "tool_result", toolCallId: "toolu_1", toolName: "search_notes", result: "3 notes found", isError: false },
            { type: "text", content: "world" },
            {
                type: "usage",
                usage: { promptTokens: 100, completionTokens: 40, totalTokens: 140, cost: 0.05, model: "claude-sonnet-5" }
            },
            { type: "done" }
        ]);
    });

    it("ignores subagent traffic (non-null parent_tool_use_id)", async () => {
        scriptAgent([
            { ...textDelta("subagent text"), parent_tool_use_id: "toolu_parent" },
            successResult()
        ]);

        const provider = new ClaudeAgentProvider();
        const chunks = await collect(provider.chatChunks([{ role: "user", content: "hi" }], {}));

        expect(chunks.filter(c => c.type === "text")).toEqual([]);
    });

    it("starts a fresh session with the plain prompt and resumes it when the transcript matches", async () => {
        const provider = new ClaudeAgentProvider();
        const config = { chatNoteId: "note-resume" };

        // Turn 1 — no history, no mapping: plain prompt, no resume.
        scriptAgent([textDelta("first reply"), successResult("sess-A")]);
        await collect(provider.chatChunks([{ role: "user", content: "first question" }], config));

        expect(queryMock).toHaveBeenCalledTimes(1);
        const firstCall = queryMock.mock.calls[0][0];
        expect(firstCall.prompt).toBe("first question");
        expect(firstCall.options.resume).toBeUndefined();

        // Turn 2 — transcript = turn 1 + streamed reply: resume with only the new message.
        scriptAgent([textDelta("second reply"), successResult("sess-A")]);
        await collect(provider.chatChunks([
            { role: "user", content: "first question" },
            { role: "assistant", content: "first reply" },
            { role: "user", content: "second question" }
        ], config));

        const secondCall = queryMock.mock.calls[1][0];
        expect(secondCall.prompt).toBe("second question");
        expect(secondCall.options.resume).toBe("sess-A");
    });

    it("reseeds a fresh session from the transcript when the history diverged", async () => {
        const provider = new ClaudeAgentProvider();
        const config = { chatNoteId: "note-diverged" };

        scriptAgent([textDelta("reply"), successResult("sess-B")]);
        await collect(provider.chatChunks([{ role: "user", content: "original" }], config));

        // The user edited the first message — the stored hash no longer matches.
        scriptAgent([textDelta("re-reply"), successResult("sess-C")]);
        await collect(provider.chatChunks([
            { role: "user", content: "edited" },
            { role: "assistant", content: "reply" },
            { role: "user", content: "follow-up" }
        ], config));

        const secondCall = queryMock.mock.calls[1][0];
        expect(secondCall.options.resume).toBeUndefined();
        expect(secondCall.prompt).toContain("<conversation_history>");
        expect(secondCall.prompt).toContain("User: edited");
        expect(secondCall.prompt).toContain("Assistant: reply");
        expect(secondCall.prompt).toContain("follow-up");
    });

    it("prepends the current-note metadata hint to the user message when contextNoteId is set", async () => {
        buildNoteHintMock.mockClear();
        scriptAgent([successResult()]);
        const provider = new ClaudeAgentProvider();
        await collect(provider.chatChunks(
            [{ role: "user", content: "what is this note about?" }],
            { contextNoteId: "note-abc" }
        ));

        expect(buildNoteHintMock).toHaveBeenCalledWith("note-abc", false);
        const prompt = queryMock.mock.calls[0][0].prompt;
        expect(prompt).toBe("NOTE_META(note-abc)\n\nwhat is this note about?");
    });

    it("does not prepend a hint when the context note no longer exists", async () => {
        buildNoteHintMock.mockReturnValueOnce(null);
        scriptAgent([successResult()]);
        const provider = new ClaudeAgentProvider();
        await collect(provider.chatChunks(
            [{ role: "user", content: "hello" }],
            { contextNoteId: "gone" }
        ));

        expect(queryMock.mock.calls[0][0].prompt).toBe("hello");
    });

    it("keeps the note hint out of the session hash so a later turn still resumes", async () => {
        const provider = new ClaudeAgentProvider();
        const config = { contextNoteId: "note-abc", chatNoteId: "note-hint-resume" };

        scriptAgent([textDelta("first reply"), successResult("sess-H")]);
        await collect(provider.chatChunks([{ role: "user", content: "q1" }], config));

        // Turn 2: transcript matches turn 1 (unhinted) → resume, and the new
        // message still carries the freshly-built hint.
        scriptAgent([textDelta("second reply"), successResult("sess-H")]);
        await collect(provider.chatChunks([
            { role: "user", content: "q1" },
            { role: "assistant", content: "first reply" },
            { role: "user", content: "q2" }
        ], config));

        const secondCall = queryMock.mock.calls[1][0];
        expect(secondCall.options.resume).toBe("sess-H");
        expect(secondCall.prompt).toBe("NOTE_META(note-abc)\n\nq2");
    });

    it("sends a supported image as a base64 block via a one-message stream", async () => {
        resolveAttachmentPartMock.mockReturnValue({ kind: "image", bytes: new Uint8Array([1, 2, 3]), mime: "image/png" });
        scriptAgent([textDelta("I see it"), successResult()]);
        const provider = new ClaudeAgentProvider();
        await collect(provider.chatChunks([
            { role: "user", content: [
                { type: "text", text: "what is this?" },
                { type: "image", attachmentId: "att-1", mime: "image/png" }
            ] }
        ], {}));

        const message = await drainPrompt(queryMock.mock.calls[0][0].prompt);
        expect(message.role).toBe("user");
        expect(message.content).toEqual([
            { type: "text", text: "what is this?" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: "AQID" } }
        ]);
    });

    it("sends a PDF as a document block and leads with the note hint", async () => {
        resolveAttachmentPartMock.mockReturnValue({ kind: "file", bytes: new Uint8Array([37, 80, 68, 70]), mime: "application/pdf", filename: "report.pdf" });
        scriptAgent([textDelta("summary"), successResult()]);
        const provider = new ClaudeAgentProvider();
        await collect(provider.chatChunks([
            { role: "user", content: [{ type: "file", attachmentId: "att-2", mime: "application/pdf", filename: "report.pdf" }] }
        ], { contextNoteId: "note-abc" }));

        const message = await drainPrompt(queryMock.mock.calls[0][0].prompt);
        expect(message.content).toEqual([
            { type: "text", text: "NOTE_META(note-abc)" },
            { type: "document", title: "report.pdf", source: { type: "base64", media_type: "application/pdf", data: "JVBERg==" } }
        ]);
    });

    it("degrades unsupported attachments to text and keeps the plain string prompt", async () => {
        // An SVG resolves to inlined text; the string path (not the stream) is used.
        resolveAttachmentPartMock.mockReturnValue({ kind: "text", text: "<file name=\"d.svg\">\n<svg/>\n</file>" });
        scriptAgent([textDelta("ok"), successResult()]);
        const provider = new ClaudeAgentProvider();
        await collect(provider.chatChunks([
            { role: "user", content: [
                { type: "text", text: "read this" },
                { type: "image", attachmentId: "att-3", mime: "image/svg+xml" }
            ] }
        ], {}));

        const prompt = queryMock.mock.calls[0][0].prompt;
        expect(typeof prompt).toBe("string");
        expect(prompt).toBe("read this\n\n<file name=\"d.svg\">\n<svg/>\n</file>");
    });

    it("wires Trilium's in-process MCP server instance and disables built-in tools", async () => {
        scriptAgent([successResult()]);
        const provider = new ClaudeAgentProvider();
        await collect(provider.chatChunks([{ role: "user", content: "hi" }], {}));

        const options = queryMock.mock.calls[0][0].options;
        expect(options.tools).toEqual([]);
        expect(options.allowedTools).toEqual(["mcp__trilium"]);
        // In-process (sdk) transport, not an HTTP endpoint — the instance is
        // Trilium's own createMcpServer(), tunneled over the SDK control channel.
        expect(options.mcpServers.trilium.type).toBe("sdk");
        expect(options.mcpServers.trilium.instance).toEqual({ mcpServerInstance: true });
        expect(createMcpServerMock).toHaveBeenCalled();
        expect(options.permissionMode).toBe("dontAsk");
        expect(options.settingSources).toEqual([]);
    });

    it("enables adaptive extended thinking when the turn requests it", async () => {
        scriptAgent([successResult()]);
        const provider = new ClaudeAgentProvider();
        await collect(provider.chatChunks([{ role: "user", content: "hi" }], { enableExtendedThinking: true }));

        expect(queryMock.mock.calls[0][0].options.thinking).toEqual({ type: "adaptive", display: "summarized" });
    });

    it("disables extended thinking by default", async () => {
        scriptAgent([successResult()]);
        const provider = new ClaudeAgentProvider();
        await collect(provider.chatChunks([{ role: "user", content: "hi" }], {}));

        expect(queryMock.mock.calls[0][0].options.thinking).toEqual({ type: "disabled" });
    });

    it("drives the user's resolved claude binary (bring-your-own-binary)", async () => {
        resolveClaudeBinaryMock.mockReturnValueOnce("/opt/homebrew/bin/claude");
        scriptAgent([successResult()]);
        const provider = new ClaudeAgentProvider();
        await collect(provider.chatChunks([{ role: "user", content: "hi" }], {}));

        expect(queryMock.mock.calls[0][0].options.pathToClaudeCodeExecutable).toBe("/opt/homebrew/bin/claude");
    });

    it("surfaces a friendly error (and never spawns) when Claude Code isn't installed", async () => {
        resolveClaudeBinaryMock.mockRejectedValueOnce(
            new Error("Claude Code CLI not found. Install it and run `claude /login`...")
        );
        const provider = new ClaudeAgentProvider();
        const chunks = await collect(provider.chatChunks([{ role: "user", content: "hi" }], {}));

        expect(queryMock).not.toHaveBeenCalled();
        const errors = chunks.filter(c => c.type === "error");
        expect(errors).toHaveLength(1);
        expect(errors[0].error).toContain("Claude Code CLI not found");
    });

    it("uses Trilium's shared system prompt (skill/link/markdown guidance) when note tools are live", async () => {
        scriptAgent([successResult()]);
        const provider = new ClaudeAgentProvider();
        await collect(provider.chatChunks([{ role: "user", content: "hi" }], { enableNoteTools: true }));

        const systemPrompt = queryMock.mock.calls[0][0].options.systemPrompt;
        // Parity with the AI-SDK providers: the shared buildSystemPrompt content.
        expect(systemPrompt).toContain("load_skill");
        expect(systemPrompt).toContain("wiki-link format [[noteId]]");
        expect(systemPrompt).toContain("Mermaid diagrams");
        // Note tools ARE live, so no "turned off" degradation notice.
        expect(systemPrompt).not.toContain("MCP server is turned off");
    });

    it("isolates the agent cwd from enclosing projects with a .git marker", async () => {
        scriptAgent([successResult()]);
        const provider = new ClaudeAgentProvider();
        await collect(provider.chatChunks([{ role: "user", content: "hi" }], {}));

        const path = await import("path");
        const fs = await import("fs");
        const cwd = queryMock.mock.calls[0][0].options.cwd;
        // Absolute cwd (TRILIUM_DATA_DIR may be relative in dev runs) with a
        // .git marker so Claude Code never resolves an enclosing repo as the
        // agent's project — that would apply the repo's disabledMcpjsonServers
        // list (silently disabling the "trilium" server by name), CLAUDE.md,
        // and auto-memory to note chats.
        expect(path.isAbsolute(cwd)).toBe(true);
        expect(fs.existsSync(path.join(cwd, ".git", "HEAD"))).toBe(true);
    });

    it("omits note-tools wiring (and its prompt guidance) when the chat disables note tools, and enables web search", async () => {
        scriptAgent([successResult()]);
        const provider = new ClaudeAgentProvider();
        await collect(provider.chatChunks([{ role: "user", content: "hi" }], { enableNoteTools: false, enableWebSearch: true }));

        const options = queryMock.mock.calls[0][0].options;
        expect(options.mcpServers).toBeUndefined();
        expect(createMcpServerMock).not.toHaveBeenCalled();
        expect(options.tools).toEqual(["WebSearch", "WebFetch"]);
        expect(options.allowedTools).toEqual(["WebSearch", "WebFetch"]);
        // Prompt matches the wiring: no note-tools guidance when they're off.
        expect(options.systemPrompt).not.toContain("load_skill");
        expect(options.systemPrompt).toContain("do not have access to the user's notes");
    });

    it("logs a diagnostic when the in-process MCP bridge fails to connect", async () => {
        scriptAgent([
            { type: "system", subtype: "init", session_id: "s", mcp_servers: [{ name: "trilium", status: "failed" }] },
            successResult()
        ]);
        const provider = new ClaudeAgentProvider();
        await collect(provider.chatChunks([{ role: "user", content: "hi" }], {}));

        expect(errorLogMock).toHaveBeenCalledWith(expect.stringContaining("failed to connect"));
    });

    it("does not log a bridge diagnostic on a healthy connected init", async () => {
        scriptAgent([
            { type: "system", subtype: "init", session_id: "s", mcp_servers: [{ name: "trilium", status: "connected" }] },
            successResult()
        ]);
        const provider = new ClaudeAgentProvider();
        await collect(provider.chatChunks([{ role: "user", content: "hi" }], {}));

        expect(errorLogMock).not.toHaveBeenCalled();
    });

    it("surfaces authentication failures with a login hint", async () => {
        scriptAgent([
            {
                type: "assistant",
                parent_tool_use_id: null,
                session_id: "sess-1",
                error: "authentication_failed",
                message: { content: [] }
            },
            { ...successResult(), subtype: "error_during_execution", is_error: true, errors: ["auth failed"] }
        ]);

        const provider = new ClaudeAgentProvider();
        const chunks = await collect(provider.chatChunks([{ role: "user", content: "hi" }], {}));

        const errors = chunks.filter(c => c.type === "error");
        expect(errors[0].error).toContain("claude /login");
    });

    it("emits an error chunk when the agent subprocess fails", async () => {
        queryMock.mockImplementation(() => (async function* () {
            yield textDelta("partial");
            throw new Error("spawn claude ENOENT");
        })());

        const provider = new ClaudeAgentProvider();
        const chunks = await collect(provider.chatChunks([{ role: "user", content: "hi" }], {}));

        const errors = chunks.filter(c => c.type === "error");
        expect(errors).toHaveLength(1);
        expect(errors[0].error).toContain("Failed to start Claude Code");
    });

    it("does not spawn the agent when the signal is already aborted at entry", async () => {
        // An abort listener alone would never fire for a pre-aborted signal —
        // the provider must bail out before spawning the subprocess.
        const controller = new AbortController();
        controller.abort();

        const provider = new ClaudeAgentProvider();
        const chunks = await collect(provider.chatChunks([{ role: "user", content: "hi" }], {}, controller.signal));

        expect(chunks).toEqual([]);
        expect(queryMock).not.toHaveBeenCalled();
    });

    it("rejects a conversation that does not end with a user message", async () => {
        const provider = new ClaudeAgentProvider();
        const chunks = await collect(provider.chatChunks([{ role: "assistant", content: "hi" }], {}));
        expect(chunks).toEqual([{ type: "error", error: "The last message must be a user message." }]);
        expect(queryMock).not.toHaveBeenCalled();
    });
});

describe("generateTitle", () => {
    beforeEach(() => {
        queryMock.mockReset();
    });

    it("returns the agent's one-shot result with surrounding quotes stripped", async () => {
        scriptAgent([{ ...successResult(), result: '"Meeting Notes Summary"' }]);
        const provider = new ClaudeAgentProvider();
        await expect(provider.generateTitle("summarize my meeting notes")).resolves.toBe("Meeting Notes Summary");

        const options = queryMock.mock.calls[0][0].options;
        expect(options.maxTurns).toBe(1);
        expect(options.persistSession).toBe(false);
    });

    it("returns an empty string when the agent fails", async () => {
        queryMock.mockImplementation(() => (async function* () {
            throw new Error("not logged in");
            yield undefined;
        })());
        const provider = new ClaudeAgentProvider();
        await expect(provider.generateTitle("hello")).resolves.toBe("");
    });
});

describe("transcript helpers", () => {
    it("hashTranscript is stable across content shapes and sensitive to edits", () => {
        const stringForm = hashTranscript([{ role: "user", content: "hello" }]);
        const partsForm = hashTranscript([{ role: "user", content: [{ type: "text", text: "hello" }] }]);
        expect(stringForm).toBe(partsForm);
        expect(hashTranscript([{ role: "user", content: "hello!" }])).not.toBe(stringForm);
    });

    it("buildSeededPrompt replays the transcript with role labels", () => {
        const prompt = buildSeededPrompt(
            [
                { role: "user", content: "q1" },
                { role: "assistant", content: "a1" }
            ],
            "q2"
        );
        expect(prompt).toContain("User: q1");
        expect(prompt).toContain("Assistant: a1");
        expect(prompt.endsWith("q2")).toBe(true);
    });
});
