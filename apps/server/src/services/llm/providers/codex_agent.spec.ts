import type { LlmStreamChunk } from "@triliumnext/commons";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@triliumnext/core", () => ({
    getLog: () => ({ info: vi.fn(), error: vi.fn() }),
    // buildSystemPrompt reads the workspace task states; none in this unit test.
    task_states: { getTaskStates: () => [] }
}));

const DATA_DIR = path.join(os.tmpdir(), "trilium-codex-agent-spec");
vi.mock("../../data_dir.js", async () => {
    const os = await import("os");
    const path = await import("path");
    return { default: { TRILIUM_DATA_DIR: path.join(os.tmpdir(), "trilium-codex-agent-spec") } };
});

vi.mock("./codex_binary.js", () => ({
    resolveCodexBinaryPath: async () => "/usr/bin/codex",
    resolveCodexAcpScript: () => "/opt/trilium/assets/codex-acp.mjs"
}));
vi.mock("./acp_mcp_endpoint.js", () => ({ getAcpMcpEndpointUrl: async () => "http://127.0.0.1:12345/mcp-secret" }));
vi.mock("@triliumnext/core/src/services/llm/note_hint.js", () => ({ buildNoteHint: () => null }));
vi.mock("@triliumnext/core/src/services/llm/attachment_content.js", () => ({ resolveAttachmentPart: vi.fn() }));

class FakeAcpError extends Error {
    constructor(public readonly code: number, message: string) {
        super(message);
    }
}

type StartOptions = {
    args?: string[];
    env?: Record<string, string>;
    cwd: string;
    onAgentRequest?: (m: string, p: unknown) => unknown;
    onNotification?: (m: string, p: unknown) => void;
};

/** Answers like `codex-acp`: `session/new` fails until `authenticate` has run, when `signedIn` is false. */
class FakeAcpClient {
    static current: FakeAcpClient | undefined;
    static lastStart: { worker: boolean; binary: string; opts: { args?: string[]; env?: Record<string, string>; cwd: string } } | undefined;
    static signedIn = true;
    /** An error `session/new` fails with, when set. */
    static sessionFailure: Error | undefined;
    /** Runs while session/prompt is answered, as the agent's own notifications and requests do. */
    static onPrompt: ((client: FakeAcpClient) => Promise<void>) | undefined;

    requests: { method: string; params: unknown }[] = [];
    onAgentRequest?: (method: string, params: unknown) => unknown;
    onNotification?: (method: string, params: unknown) => void;

    static start(binary: string, opts: StartOptions) {
        return FakeAcpClient.launch(false, binary, opts);
    }

    static startWorker(script: string, opts: StartOptions) {
        return FakeAcpClient.launch(true, script, opts);
    }

    private static launch(worker: boolean, binary: string, opts: StartOptions) {
        FakeAcpClient.lastStart = { worker, binary, opts };
        FakeAcpClient.current = new FakeAcpClient();
        FakeAcpClient.current.onAgentRequest = opts.onAgentRequest;
        FakeAcpClient.current.onNotification = opts.onNotification;
        return FakeAcpClient.current;
    }

    async request<T>(method: string, params: unknown): Promise<T> {
        this.requests.push({ method, params });
        if (method === "authenticate") {
            FakeAcpClient.signedIn = true;
        }
        if (method === "session/new") {
            if (FakeAcpClient.sessionFailure) throw FakeAcpClient.sessionFailure;
            if (!FakeAcpClient.signedIn) throw new FakeAcpError(-32000, "Authentication required");
            return { sessionId: "sess-1", models: { currentModelId: "gpt-6-luna[medium]", availableModels: REMOTE_MODELS } } as T;
        }
        if (method === "session/prompt") {
            await FakeAcpClient.onPrompt?.(this);
            return { stopReason: "end_turn" } as T;
        }
        return {} as T;
    }

    notify(): void {}
    dispose(): void {}
    get alive(): boolean {
        return true;
    }

    methods(): string[] {
        return this.requests.map(r => r.method);
    }
}

vi.mock("./acp_client.js", () => ({ AcpClient: FakeAcpClient, AcpError: FakeAcpError }));

const { resetAcpAgentStateForTests } = await import("./acp_agent.js");
const { buildCodexModelList, CodexAgentProvider, decideCodexPermission, resetCodexCatalogForTests } = await import("./codex_agent.js");

/** Part of the catalog codex-acp 1.13.1 reports on session/new for a ChatGPT account. */
const REMOTE_MODELS = [
    ...["low", "medium", "high", "xhigh", "max"].map(effort => ({
        modelId: `gpt-6-luna[${effort}]`,
        name: `6 Luna (${effort})`,
        description: "Fast and affordable model for easier tasks."
    })),
    ...["low", "medium", "high", "xhigh", "max", "ultra"].map(effort => ({
        modelId: `gpt-5.6-terra[${effort}]`,
        name: `5.6 Terra (${effort})`,
        description: "Older balanced model for straightforward work."
    })),
    { modelId: "gpt-5.5[high]", name: "5.5 (high)", description: "Legacy coding model." },
    { modelId: "gpt-5.5[low]", name: "5.5 (low)", description: "Legacy coding model." }
];

async function collect(iterable: AsyncIterable<LlmStreamChunk>): Promise<LlmStreamChunk[]> {
    const chunks: LlmStreamChunk[] = [];
    for await (const chunk of iterable) {
        if (chunk.type !== "status") {
            chunks.push(chunk);
        }
    }
    return chunks;
}

beforeEach(() => {
    resetAcpAgentStateForTests();
    resetCodexCatalogForTests();
    FakeAcpClient.current = undefined;
    FakeAcpClient.lastStart = undefined;
    FakeAcpClient.signedIn = true;
    FakeAcpClient.sessionFailure = undefined;
    FakeAcpClient.onPrompt = undefined;
});

describe("CodexAgentProvider", () => {
    it("runs the bundled adapter in a worker against the user's Codex, read-only, with a home of Trilium's own, and denies what it asks permission for", async () => {
        await collect(new CodexAgentProvider().chatChunks([{ role: "user", content: "hi" }], {}));

        const start = FakeAcpClient.lastStart;
        expect(start?.worker).toBe(true);
        expect(start?.binary).toBe("/opt/trilium/assets/codex-acp.mjs");
        expect(start?.opts.env).toEqual({
            CODEX_PATH: "/usr/bin/codex",
            CODEX_HOME: path.join(DATA_DIR, "codex-agent", "home"),
            INITIAL_AGENT_MODE: "read-only"
        });
        expect(start?.opts.cwd).toBe(path.join(DATA_DIR, "codex-agent", "workspace"));
        expect(FakeAcpClient.current?.onAgentRequest?.("session/request_permission", {
            toolCall: { kind: "execute", title: "rm -rf /" },
            options: [{ optionId: "allow", kind: "allow_once" }, { optionId: "deny", kind: "reject_once" }]
        })).toEqual({ outcome: { outcome: "selected", optionId: "deny" } });
    });

    it("signs in with ChatGPT during the model probe, but reports a missing sign-in in the chat instead", async () => {
        FakeAcpClient.signedIn = false;
        const chunks = await collect(new CodexAgentProvider().chatChunks([{ role: "user", content: "hi" }], {}));
        expect(chunks).toEqual([{ type: "error", error: expect.stringContaining("not signed in") }]);
        expect(FakeAcpClient.current?.methods()).not.toContain("authenticate");

        await new CodexAgentProvider().listModels();
        expect(FakeAcpClient.current?.methods()).toEqual(["initialize", "session/new", "authenticate", "session/new"]);
        expect(FakeAcpClient.current?.requests[2].params).toEqual({ methodId: "chat-gpt" });
    });

    it("explains a failure to start, sign in or answer in words the user can act on", async () => {
        const failureOf = async (error: Error) => {
            FakeAcpClient.sessionFailure = error;
            resetAcpAgentStateForTests();
            return new CodexAgentProvider().listModels().then(() => "resolved", (err: Error) => err.message);
        };
        expect(await failureOf(new Error("ACP request \"authenticate\" timed out after 300000ms"))).toMatch(/sign-in was not completed in time/);
        expect(await failureOf(new Error("spawn /usr/bin/codex ENOENT"))).toBe("Failed to start Codex: spawn /usr/bin/codex ENOENT");
        expect(await failureOf(new Error("Something else"))).toBe("Something else");
    });

    it("leaves the default model to Codex, runs any other at the chosen effort, and titles on the lead model at its lightest", async () => {
        const provider = new CodexAgentProvider();
        const modelSetFor = async (config: Record<string, unknown>) => {
            await collect(provider.chatChunks([{ role: "user", content: "hi" }], config));
            return (FakeAcpClient.current?.requests.filter(r => r.method === "session/set_model").at(-1)?.params as { modelId?: string } | undefined)?.modelId;
        };

        expect(await modelSetFor({})).toBeUndefined();
        expect(await modelSetFor({ model: "gpt-6-luna", reasoningEffort: "high" })).toBe("gpt-6-luna[high]");
        // No choice: the model's default, medium.
        expect(await modelSetFor({ model: "gpt-5.6-terra" })).toBe("gpt-5.6-terra[medium]");
        // A level the model lacks: the nearest one, the higher on a tie.
        expect(await modelSetFor({ model: "gpt-5.5", reasoningEffort: "medium" })).toBe("gpt-5.5[high]");
        // An id that names no grouped model passes through.
        expect(await modelSetFor({ model: "gpt-6-luna[low]" })).toBe("gpt-6-luna[low]");

        const pooled = FakeAcpClient.current;
        await provider.listModels();
        await provider.generateTitle("plan my week");
        expect(pooled?.requests.filter(r => r.method === "session/set_model").at(-1)?.params).toEqual({ sessionId: "sess-1", modelId: "gpt-6-luna[low]" });
    });
});

describe("buildCodexModelList", () => {
    it("lists each model once with the efforts it comes in, marks the older ones and pre-selects the rest", () => {
        const models = buildCodexModelList({ availableModels: REMOTE_MODELS });

        expect(models).toEqual([
            { id: "default", name: "Default", pricing: { input: 0, output: 0 }, isDefault: true, isSubscription: true },
            { id: "gpt-6-luna", name: "GPT-6 Luna", pricing: { input: 0, output: 0 }, isSubscription: true, reasoningEfforts: ["low", "medium", "high", "xhigh", "max"], defaultReasoningEffort: "medium" },
            // `ultra` is no level Trilium can name, so it is left out.
            { id: "gpt-5.6-terra", name: "GPT-5.6 Terra", pricing: { input: 0, output: 0 }, isSubscription: true, isLegacy: true, reasoningEfforts: ["low", "medium", "high", "xhigh", "max"], defaultReasoningEffort: "medium" },
            // Sorted weakest first, defaulting to the lightest without medium.
            { id: "gpt-5.5", name: "GPT-5.5", pricing: { input: 0, output: 0 }, isSubscription: true, isLegacy: true, reasoningEfforts: ["low", "high"], defaultReasoningEffort: "low" }
        ]);
        expect([...new CodexAgentProvider().recommendedModelIds(models)]).toEqual(["default", "gpt-6-luna"]);
    });

    it("keeps a model without a level in its id as it is", () => {
        expect(buildCodexModelList({ availableModels: [{ modelId: "codex-mini", name: "Codex Mini" }] })[1])
            .toEqual({ id: "codex-mini", name: "Codex Mini", pricing: { input: 0, output: 0 }, isSubscription: true });
    });
});

/** The options codex-acp 1.13.1 offers for an MCP tool approval. */
const MCP_APPROVAL_OPTIONS = [
    { optionId: "allow_once", name: "Allow", kind: "allow_once" },
    { optionId: "allow_session", name: "Allow for this session", kind: "allow_always" },
    { optionId: "allow_always", name: "Always allow", kind: "allow_always" },
    { optionId: "cancel", name: "Cancel", kind: "reject_once" }
];

/** A tool call as codex-acp 1.13.1 announces an MCP call, before asking to run it. */
function mcpToolCall(toolCallId: string, server: string, tool: string, args: Record<string, unknown>) {
    return {
        sessionUpdate: "tool_call", toolCallId, kind: "execute", title: `mcp.${server}.${tool}`, status: "in_progress",
        rawInput: { server, tool, arguments: args }, _meta: { is_mcp_tool_call: true }
    };
}

/** The permission request codex-acp 1.13.1 sends for an announced MCP call. */
function mcpApproval(toolCallId: string, extra: Record<string, unknown> = {}) {
    return { sessionId: "sess-1", toolCall: { toolCallId, kind: "execute", status: "pending", ...extra }, _meta: { is_mcp_tool_approval: true }, options: MCP_APPROVAL_OPTIONS };
}

const ALLOWED = { outcome: { outcome: "selected", optionId: "allow_once" } };
const DENIED = { outcome: { outcome: "selected", optionId: "cancel" } };

describe("CodexAgentProvider note tools", () => {
    it("runs Trilium's note tools, shown by their name and result, and denies calls to any other MCP server", async () => {
        const answers: unknown[] = [];
        FakeAcpClient.onPrompt = async client => {
            const update = (u: Record<string, unknown>) => client.onNotification?.("session/update", { sessionId: "sess-1", update: u });
            const ask = async (request: unknown) => answers.push(await client.onAgentRequest?.("session/request_permission", request));

            update({ sessionUpdate: "tool_call", toolCallId: "mcp_startup.trilium", kind: "other", title: "mcp__trilium__startup", status: "failed" });
            update(mcpToolCall("exec-1", "trilium", "read_note", { noteId: "abc" }));
            await ask(mcpApproval("exec-1"));
            update(mcpToolCall("exec-2", "codex_apps", "send_email", { to: "x" }));
            await ask(mcpApproval("exec-2"));
            // A request that is no MCP approval is denied even for a note-tool call.
            await ask({ ...mcpApproval("exec-1"), _meta: undefined });
            update({
                sessionUpdate: "tool_call_update", toolCallId: "exec-1", status: "completed",
                rawOutput: { result: { content: [{ type: "text", text: "Note abc: groceries." }], structuredContent: null, _meta: null }, error: null }
            });
            // Once finished, the call id no longer vouches for anything.
            await ask(mcpApproval("exec-1"));
        };

        const chunks = await collect(new CodexAgentProvider().chatChunks([{ role: "user", content: "hi" }], { enableNoteTools: true }));

        expect(answers).toEqual([ALLOWED, DENIED, DENIED, DENIED]);
        expect(chunks.filter(c => c.type === "tool_use" || c.type === "tool_result")).toEqual([
            { type: "tool_use", toolCallId: "exec-1", toolName: "read_note", toolInput: { noteId: "abc" } },
            { type: "tool_use", toolCallId: "exec-2", toolName: "send_email", toolInput: { to: "x" } },
            { type: "tool_result", toolCallId: "exec-1", toolName: "read_note", result: "Note abc: groceries.", isError: false }
        ]);
    });

    it("approves a call the adapter could not match to its announcement by the server it names", () => {
        const standalone = (serverName: string) => ({
            ...mcpApproval("elicitation:sess-1:trilium:1", { title: "MCP tool call approval", rawInput: { serverName, description: "Allow?" } })
        });
        expect(decideCodexPermission(standalone("trilium"), "test")).toEqual(ALLOWED);
        expect(decideCodexPermission(standalone("codex_apps"), "test")).toEqual(DENIED);
        // No one-shot allow on offer: nothing is approved permanently.
        expect(decideCodexPermission({ ...standalone("trilium"), options: MCP_APPROVAL_OPTIONS.slice(1) }, "test")).toEqual(DENIED);
    });
});
