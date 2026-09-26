/**
 * Live integration test for the Codex Agent provider: runs the installed
 * `@agentclientprotocol/codex-acp` in a worker against the user's real `codex`
 * (TRILIUM_CODEX_PATH or PATH), asserts that a chat turn gets an answer, and
 * that a note tool runs: Codex asks before calling an MCP tool that is not
 * marked read-only, which the provider has to approve.
 *
 * Opt-in — it starts Codex, needs a saved ChatGPT sign-in, and spends the
 * plan's Codex usage, so it never runs in CI:
 *
 *     TRILIUM_CODEX_LIVE_TEST=1 TRILIUM_RESOURCE_DIR=src pnpm --filter server test codex_agent.live
 *
 * The sign-in (`auth.json`) is copied from TRILIUM_CODEX_LIVE_HOME (default: the
 * dev server's `data/codex-agent/home`) into a temporary data directory. The
 * note tools are a stand-in MCP server, so no database is needed.
 */

import type { LlmStreamChunk } from "@triliumnext/commons";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import fs from "fs";
import http from "http";
import type { AddressInfo } from "net";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { resetAcpAgentStateForTests } from "./acp_agent.js";
import { CodexAgentProvider } from "./codex_agent.js";

const live = process.env.TRILIUM_CODEX_LIVE_TEST === "1";

/** A data directory of the run's own, so the dev server's sessions are left alone. */
const dataDir = path.join(os.tmpdir(), "trilium-codex-live");
vi.mock("../../data_dir.js", async () => {
    const nodeOs = await import("os");
    const nodePath = await import("path");
    return { default: { TRILIUM_DATA_DIR: nodePath.join(nodeOs.tmpdir(), "trilium-codex-live") } };
});

const noteToolsUrl = vi.hoisted(() => ({ value: "" }));
vi.mock("./acp_mcp_endpoint.js", () => ({ getAcpMcpEndpointUrl: async () => noteToolsUrl.value }));

describe.runIf(live)("CodexAgentProvider (live adapter)", () => {
    let noteTools: http.Server | undefined;
    const readNotes: string[] = [];

    beforeAll(async () => {
        const sourceHome = process.env.TRILIUM_CODEX_LIVE_HOME ?? path.resolve("data", "codex-agent", "home");
        const home = path.join(dataDir, "codex-agent", "home");
        fs.mkdirSync(home, { recursive: true });
        fs.copyFileSync(path.join(sourceHome, "auth.json"), path.join(home, "auth.json"));

        noteTools = http.createServer(async (req, res) => {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
                chunks.push(chunk as Buffer);
            }
            const server = new McpServer({ name: "trilium", version: "0" });
            // No readOnlyHint, like Trilium's own tools, so Codex asks before running it.
            server.registerTool("read_note", { description: "Read a note by its ID.", inputSchema: { noteId: z.string() } }, async ({ noteId }) => {
                readNotes.push(noteId);
                return { content: [{ type: "text", text: `Note ${noteId}: the secret word is PINEAPPLE.` }] };
            });
            const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
            res.on("close", () => void transport.close());
            await server.connect(transport);
            await transport.handleRequest(req, res, chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined);
        });
        await new Promise<void>(resolve => noteTools?.listen(0, "127.0.0.1", resolve));
        noteToolsUrl.value = `http://127.0.0.1:${(noteTools.address() as AddressInfo).port}/mcp`;
    });

    afterAll(() => {
        resetAcpAgentStateForTests();
        noteTools?.close();
    });

    async function turn(content: string, config: Record<string, unknown>): Promise<LlmStreamChunk[]> {
        const chunks: LlmStreamChunk[] = [];
        for await (const chunk of new CodexAgentProvider().chatChunks([{ role: "user", content }], config)) {
            chunks.push(chunk);
        }
        expect(chunks.filter(c => c.type === "error")).toEqual([]);
        return chunks;
    }

    const replyOf = (chunks: LlmStreamChunk[]) => chunks.map(c => (c.type === "text" ? c.content : "")).join("");

    it("lists the account's models and answers a chat turn", async () => {
        expect((await new CodexAgentProvider().listModels()).length).toBeGreaterThan(1);
        expect(replyOf(await turn("Reply with exactly the word: Hi", { chatNoteId: "live-codex" }))).toMatch(/\bHi\b/);
    }, 180_000);

    it("runs a note tool once the provider approves it", async () => {
        const chunks = await turn("Use the read_note tool on note abc and tell me its secret word.", { chatNoteId: "live-codex-tools", enableNoteTools: true });

        expect(readNotes).toEqual(["abc"]);
        expect(chunks).toContainEqual({ type: "tool_use", toolCallId: expect.any(String), toolName: "read_note", toolInput: { noteId: "abc" } });
        expect(chunks).toContainEqual(expect.objectContaining({ type: "tool_result", toolName: "read_note", result: "Note abc: the secret word is PINEAPPLE.", isError: false }));
        expect(replyOf(chunks)).toMatch(/PINEAPPLE/);
    }, 180_000);
});
