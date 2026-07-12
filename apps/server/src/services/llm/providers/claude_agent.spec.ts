import type { LlmStreamChunk } from "@triliumnext/commons";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const getOptionOrNullMock = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
    query: queryMock
}));

vi.mock("@triliumnext/core", () => ({
    getLog: () => ({ info: vi.fn(), error: vi.fn() }),
    options: { getOptionOrNull: getOptionOrNullMock },
    // buildSystemPrompt (reached via composeSystemPrompt) reads the workspace
    // task states; no custom states in this unit test.
    task_states: { getTaskStates: () => [] }
}));

vi.mock("../../data_dir.js", async () => {
    const os = await import("os");
    const path = await import("path");
    return { default: { TRILIUM_DATA_DIR: path.join(os.tmpdir(), "trilium-claude-agent-spec") } };
});

vi.mock("../../port.js", () => ({ default: 8080 }));

const { buildSeededPrompt, ClaudeAgentProvider, hashTranscript } = await import("./claude_agent.js");

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
        getOptionOrNullMock.mockReset();
        getOptionOrNullMock.mockReturnValue("true"); // mcpEnabled
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

    it("points the agent at Trilium's MCP server and disables built-in tools", async () => {
        scriptAgent([successResult()]);
        const provider = new ClaudeAgentProvider();
        await collect(provider.chatChunks([{ role: "user", content: "hi" }], {}));

        const options = queryMock.mock.calls[0][0].options;
        expect(options.tools).toEqual([]);
        expect(options.allowedTools).toEqual(["mcp__trilium"]);
        expect(options.mcpServers.trilium.url).toBe("http://127.0.0.1:8080/mcp");
        expect(options.permissionMode).toBe("dontAsk");
        expect(options.settingSources).toEqual([]);
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

    it("tells the model why note tools are missing when the MCP server is disabled", async () => {
        getOptionOrNullMock.mockReturnValue(null);
        scriptAgent([successResult()]);
        const provider = new ClaudeAgentProvider();
        await collect(provider.chatChunks([{ role: "user", content: "hi" }], {}));

        const options = queryMock.mock.calls[0][0].options;
        expect(options.systemPrompt).toContain("MCP server is turned off");
        // The prompt must not promise note tools that aren't actually wired.
        expect(options.systemPrompt).not.toContain("load_skill");
        expect(options.systemPrompt).toContain("do not have access to the user's notes");
    });

    it("omits MCP wiring when the MCP server is disabled, and enables web search on request", async () => {
        getOptionOrNullMock.mockReturnValue(null);
        scriptAgent([successResult()]);
        const provider = new ClaudeAgentProvider();
        await collect(provider.chatChunks([{ role: "user", content: "hi" }], { enableWebSearch: true }));

        const options = queryMock.mock.calls[0][0].options;
        expect(options.mcpServers).toBeUndefined();
        expect(options.tools).toEqual(["WebSearch", "WebFetch"]);
        expect(options.allowedTools).toEqual(["WebSearch", "WebFetch"]);
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
        getOptionOrNullMock.mockReset();
        getOptionOrNullMock.mockReturnValue(null);
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
