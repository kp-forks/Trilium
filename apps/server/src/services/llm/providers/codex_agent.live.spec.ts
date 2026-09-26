/**
 * Live integration test for the Codex Agent provider: runs the installed
 * `@agentclientprotocol/codex-acp` in a worker against the user's real `codex`
 * (TRILIUM_CODEX_PATH or PATH) and asserts that a chat turn gets an answer.
 *
 * Opt-in — it starts Codex, needs a saved ChatGPT sign-in, and spends the
 * plan's Codex usage, so it never runs in CI:
 *
 *     TRILIUM_CODEX_LIVE_TEST=1 TRILIUM_RESOURCE_DIR=src pnpm --filter server test codex_agent.live
 *
 * The sign-in (`auth.json`) is copied from TRILIUM_CODEX_LIVE_HOME (default: the
 * dev server's `data/codex-agent/home`) into a temporary data directory.
 */

import type { LlmStreamChunk } from "@triliumnext/commons";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";

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

describe.runIf(live)("CodexAgentProvider (live adapter)", () => {
    it("lists the account's models and answers a chat turn", async () => {
        const sourceHome = process.env.TRILIUM_CODEX_LIVE_HOME ?? path.resolve("data", "codex-agent", "home");
        const home = path.join(dataDir, "codex-agent", "home");
        fs.mkdirSync(home, { recursive: true });
        fs.copyFileSync(path.join(sourceHome, "auth.json"), path.join(home, "auth.json"));

        const provider = new CodexAgentProvider();
        try {
            const models = await provider.listModels();
            expect(models.length).toBeGreaterThan(1);

            const chunks: LlmStreamChunk[] = [];
            for await (const chunk of provider.chatChunks([{ role: "user", content: "Reply with exactly the word: Hi" }], { chatNoteId: "live-codex" })) {
                chunks.push(chunk);
            }
            const text = chunks.map(c => (c.type === "text" ? c.content : "")).join("");
            expect(chunks.filter(c => c.type === "error")).toEqual([]);
            expect(text).toMatch(/\bHi\b/);
        } finally {
            resetAcpAgentStateForTests();
        }
    }, 180_000);
});
