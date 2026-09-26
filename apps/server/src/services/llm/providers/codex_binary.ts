/**
 * Resolves the Codex ACP adapter (`codex-acp`), which the Codex Agent provider
 * drives.
 *
 * Bring-your-own-binary like the other agent providers: nothing is bundled. The
 * adapter is the npm package `@agentclientprotocol/codex-acp`, which depends on
 * `@openai/codex` and starts that Codex CLI itself, so it is the only thing the
 * user installs.
 *
 * Resolution order: the TRILIUM_CODEX_ACP_PATH override, then `codex-acp` on
 * PATH (see `findOnPath`, which also asks the login shell). The resolved binary
 * is probed with `--version` once so a broken install surfaces as a clear error
 * instead of an opaque spawn failure mid-chat.
 */

import { getLog } from "@triliumnext/core";
import { execFile } from "child_process";
import { existsSync } from "fs";
import { promisify } from "util";

import { findOnPath } from "./binary_lookup.js";
import { needsShell } from "./copilot_binary.js";

const execFileAsync = promisify(execFile);

const PROBE_TIMEOUT_MS = 15000;

const INSTALL_HINT = "Install it with `npm install -g @agentclientprotocol/codex-acp` on the machine running the Trilium server, or set the TRILIUM_CODEX_ACP_PATH environment variable to its location.";

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

async function probeBinary(): Promise<string> {
    const binary = await locateBinary();

    // Async on purpose — this runs on the first chat request, and a sync probe
    // would freeze the whole server for up to the timeout.
    let version: string;
    try {
        // `shell` is required for the .cmd shim npm creates on Windows, and
        // then the path is not quoted for us.
        const shell = needsShell(binary);
        const { stdout } = await execFileAsync(shell ? `"${binary}"` : binary, ["--version"], { timeout: PROBE_TIMEOUT_MS, encoding: "utf8", shell });
        version = stdout.trim() || "version not reported";
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Found the Codex ACP adapter at "${binary}" but it failed to run (${detail}). ${INSTALL_HINT}`);
    }

    getLog().info(`Codex Agent provider: using the Codex ACP adapter at ${binary} (${version})`);
    return binary;
}

async function locateBinary(): Promise<string> {
    const override = process.env.TRILIUM_CODEX_ACP_PATH?.trim();
    if (override) {
        if (!existsSync(override)) {
            throw new Error(`TRILIUM_CODEX_ACP_PATH is set to "${override}", but no file exists there.`);
        }
        return override;
    }

    const onPath = await findOnPath("codex-acp");
    if (onPath) {
        return onPath;
    }

    throw new Error(`The Codex ACP adapter (codex-acp) was not found. ${INSTALL_HINT}`);
}
