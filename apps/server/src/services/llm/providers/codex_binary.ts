/**
 * Resolves what the Codex Agent provider runs: the Codex ACP adapter, which
 * Trilium ships, and the user's own Codex CLI, which the adapter drives.
 *
 * The adapter (`@agentclientprotocol/codex-acp`) is one bundled script that
 * translates ACP into Codex's `codex app-server` protocol. It runs in a worker
 * thread (see `AcpClient.startWorker`), so no Node is needed on the host. The
 * Codex CLI stays bring-your-own like the other agent CLIs: its native build is
 * 300-400 MB per platform, and it must update as fast as OpenAI ships models.
 *
 * The CLI is resolved from the TRILIUM_CODEX_PATH override, then `codex` on
 * PATH (see `findOnPath`, which also asks the login shell), and probed with
 * `--version` once so a broken install surfaces as a clear error instead of an
 * opaque failure mid-chat.
 */

import { getLog } from "@triliumnext/core";
import { execFile } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { promisify } from "util";

import { RESOURCE_DIR } from "../../resource_dir.js";
import { findOnPath } from "./binary_lookup.js";
import { needsShell } from "./copilot_binary.js";

const execFileAsync = promisify(execFile);

const PROBE_TIMEOUT_MS = 15000;

const INSTALL_HINT = "Install it (for example with `npm install -g @openai/codex`) on the machine running the Trilium server, or set the TRILIUM_CODEX_PATH environment variable to its location.";

/**
 * The in-flight/successful resolution. Caching the promise lets concurrent
 * first calls share one probe; a failed probe clears it so a later install is
 * picked up without a restart.
 */
let cachedResolution: Promise<string> | undefined;

export function resolveCodexBinaryPath(): Promise<string> {
    if (!cachedResolution) {
        cachedResolution = probeBinary().catch((err: unknown) => {
            cachedResolution = undefined;
            throw err;
        });
    }
    return cachedResolution;
}

/** For tests: forget the probed binary so the next call re-resolves. */
export function resetCodexBinaryCache(): void {
    cachedResolution = undefined;
}

/**
 * The adapter script: the copy the build places under RESOURCE_DIR, or the
 * installed package when running from source.
 */
export function resolveCodexAcpScript(): string {
    const bundled = path.join(RESOURCE_DIR, "codex-acp.mjs");
    return existsSync(bundled) ? bundled : require.resolve("@agentclientprotocol/codex-acp");
}

async function probeBinary(): Promise<string> {
    const binary = await locateBinary();

    // Async on purpose — this runs on the first chat request, and a sync probe
    // would freeze the whole server for up to the timeout.
    let output: string;
    try {
        // `shell` is required for the .cmd shim npm creates on Windows, and
        // then the path is not quoted for us.
        const shell = needsShell(binary);
        const { stdout } = await execFileAsync(shell ? `"${binary}"` : binary, ["--version"], { timeout: PROBE_TIMEOUT_MS, encoding: "utf8", shell });
        output = stdout.trim();
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Found the Codex CLI at "${binary}" but it failed to run (${detail}). ${INSTALL_HINT}`);
    }

    const version = /\d+\.\d+\.\d+\S*/.exec(output)?.[0];
    if (!version) {
        throw new Error(`Found the Codex CLI at "${binary}" but it did not report a version${output ? ` (it printed: ${output})` : ""}. ${INSTALL_HINT}`);
    }

    getLog().info(`Codex Agent provider: using the Codex CLI at ${binary} (${version})`);
    return binary;
}

async function locateBinary(): Promise<string> {
    const override = process.env.TRILIUM_CODEX_PATH?.trim();
    if (override) {
        if (!existsSync(override)) {
            throw new Error(`TRILIUM_CODEX_PATH is set to "${override}", but no file exists there.`);
        }
        return override;
    }

    const onPath = await findOnPath("codex");
    if (onPath) {
        return onPath;
    }

    throw new Error(`The Codex CLI (codex) was not found. ${INSTALL_HINT}`);
}
