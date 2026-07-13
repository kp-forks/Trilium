/**
 * Resolves the Claude Code CLI binary the Claude Agent provider drives.
 *
 * The provider runs in "bring-your-own-binary" mode: the ~250 MB native binary
 * that the SDK would otherwise bundle is stripped at install time (see the
 * root .pnpmfile.cjs), so we point the SDK at the user's own installed CLI via
 * `pathToClaudeCodeExecutable`. This keeps the server install lean and lets each
 * platform provide a binary that actually runs there (e.g. the nixpkgs wrapper
 * on NixOS, which needs no glibc/nix-ld shim — unlike the SDK's bundled ELF).
 *
 * Resolution order: the TRILIUM_CLAUDE_CODE_PATH override, then `claude` on
 * PATH. The resolved binary is probed with `--version` once so a broken/absent
 * install surfaces as a clear, actionable error instead of an opaque spawn
 * failure mid-chat.
 */

import { getLog } from "@triliumnext/core";
import { execFileSync } from "child_process";
import { existsSync } from "fs";
import path from "path";

/** Cached only on success, so a later install is picked up without a restart. */
let cachedPath: string | undefined;

export function resolveClaudeBinaryPath(): string {
    if (cachedPath) {
        return cachedPath;
    }

    const binary = locateBinary();

    // Probe once: confirms the binary actually runs on this host (catches a
    // wrong-arch/broken install) and records the version for diagnostics.
    let version: string;
    try {
        version = execFileSync(binary, ["--version"], { timeout: 15000, encoding: "utf8" }).trim();
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Found Claude Code at "${binary}" but it failed to run (${detail}). Ensure it is installed correctly and that you've run \`claude /login\` on the machine running the Trilium server.`);
    }

    getLog().info(`Claude Agent provider: using Claude Code at ${binary} (${version})`);
    cachedPath = binary;
    return binary;
}

/** For tests: forget the probed binary so the next call re-resolves. */
export function resetClaudeBinaryCache(): void {
    cachedPath = undefined;
}

function locateBinary(): string {
    const override = process.env.TRILIUM_CLAUDE_CODE_PATH?.trim();
    if (override) {
        if (!existsSync(override)) {
            throw new Error(`TRILIUM_CLAUDE_CODE_PATH is set to "${override}", but no file exists there.`);
        }
        return override;
    }

    const onPath = findOnPath("claude");
    if (onPath) {
        return onPath;
    }

    throw new Error("Claude Code CLI not found. Install it (`npm install -g @anthropic-ai/claude-code`) and run `claude /login` on the machine running the Trilium server, or set the TRILIUM_CLAUDE_CODE_PATH environment variable to its location.");
}

function findOnPath(binary: string): string | undefined {
    // Windows resolves executables via PATHEXT; on POSIX the bare name suffices.
    const extensions = process.platform === "win32" ? ["", ".cmd", ".exe", ".bat"] : [""];
    for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
        if (!dir) {
            continue;
        }
        for (const ext of extensions) {
            const candidate = path.join(dir, binary + ext);
            if (existsSync(candidate)) {
                return candidate;
            }
        }
    }
    return undefined;
}
