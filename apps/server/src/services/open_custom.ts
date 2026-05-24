import fs from "fs";
import path from "path";

/**
 * Validates a path received from the renderer for the "open-custom" IPC channel.
 * Returns the resolved absolute path on success; throws on any invariant
 * violation so a hostile or buggy caller surfaces loudly in the main-process
 * log rather than silently doing something unexpected.
 *
 * Invariants:
 *   - filePath is a non-empty string with no NUL byte
 *   - resolves strictly under `tmpDir` (no traversal, no arbitrary locations)
 *   - the file actually exists on disk
 */
export function validateOpenCustomPath(filePath: unknown, tmpDir: string): string {
    if (typeof filePath !== "string" || filePath.length === 0 || filePath.includes("\0")) {
        throw new Error("open-custom: invalid filePath");
    }

    const resolved = path.resolve(filePath);
    const tmpRoot = path.resolve(tmpDir) + path.sep;
    const inTmp = process.platform === "win32"
        ? resolved.toLowerCase().startsWith(tmpRoot.toLowerCase())
        : resolved.startsWith(tmpRoot);
    if (!inTmp) {
        throw new Error(`open-custom: refusing path outside tmpdir: ${resolved}`);
    }

    if (!fs.existsSync(resolved)) {
        throw new Error(`open-custom: file does not exist: ${resolved}`);
    }

    return resolved;
}
