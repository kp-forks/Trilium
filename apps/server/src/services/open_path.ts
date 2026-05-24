import fs from "fs";
import path from "path";

/**
 * Validates a path received from the renderer for the "open-path" IPC
 * channel. Returns the resolved absolute path on success; throws on any
 * invariant violation so a hostile or buggy caller surfaces loudly in the
 * main-process log.
 *
 * The two legitimate callers (Open Note/Attachment Externally, and the
 * "open data directory" link in the About dialog) only ever pass paths the
 * server itself produced — either inside Trilium's tmp dir or equal to the
 * data dir. Locking the IPC channel to that surface blocks the otherwise-
 * generic "open any file on disk" primitive (including UNC paths, which
 * resolve via SMB on Windows and leak the user's NTLM hash).
 */
export function validateOpenPath(input: unknown, dataDir: string, tmpDir: string): string {
    if (typeof input !== "string" || input.length === 0 || input.includes("\0")) {
        throw new Error("open-path: invalid filePath");
    }

    const resolved = path.resolve(input);
    const isWin = process.platform === "win32";
    const norm = (s: string) => isWin ? s.toLowerCase() : s;

    const isUnderOrEquals = (root: string) => {
        const r = path.resolve(root);
        return norm(resolved) === norm(r)
            || norm(resolved).startsWith(norm(r) + path.sep);
    };

    if (!isUnderOrEquals(dataDir) && !isUnderOrEquals(tmpDir)) {
        throw new Error(`open-path: refusing path outside data dir: ${resolved}`);
    }

    if (!fs.existsSync(resolved)) {
        throw new Error(`open-path: file does not exist: ${resolved}`);
    }

    return resolved;
}
