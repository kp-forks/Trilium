import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { validateOpenCustomPath } from "./open_custom.js";

describe("validateOpenCustomPath", () => {
    let tmpDir: string;
    let validFile: string;
    let hostileFile: string;

    beforeAll(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trilium-open-custom-"));
        validFile = path.join(tmpDir, "plain.txt");
        fs.writeFileSync(validFile, "");
        // A filename containing `&` is the original command-injection regression:
        // when the path was interpolated into a cmd.exe string, the `&` chained
        // arbitrary commands. The validator must ACCEPT this filename — the fix
        // is to never route through a shell, not to reject the name.
        hostileFile = path.join(tmpDir, "foo & calc & rem .txt");
        fs.writeFileSync(hostileFile, "");
    });

    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("rejects malformed input", () => {
        expect(() => validateOpenCustomPath(undefined, tmpDir)).toThrow(/invalid filePath/);
        expect(() => validateOpenCustomPath(null, tmpDir)).toThrow(/invalid filePath/);
        expect(() => validateOpenCustomPath(123, tmpDir)).toThrow(/invalid filePath/);
        expect(() => validateOpenCustomPath({}, tmpDir)).toThrow(/invalid filePath/);
        expect(() => validateOpenCustomPath("", tmpDir)).toThrow(/invalid filePath/);
        expect(() => validateOpenCustomPath(path.join(tmpDir, "foo\0.txt"), tmpDir))
            .toThrow(/invalid filePath/);
    });

    it("rejects paths outside the sandbox", () => {
        const outside = process.platform === "win32" ? "C:\\Windows\\Temp\\evil.txt" : "/etc/passwd";
        expect(() => validateOpenCustomPath(outside, tmpDir)).toThrow(/outside tmpdir/);

        // ".." traversal escapes the sandbox after path.resolve normalisation
        const traversal = path.join(tmpDir, "..", "..", "..", "evil.txt");
        expect(() => validateOpenCustomPath(traversal, tmpDir)).toThrow(/outside tmpdir/);

        // Relative paths resolve against cwd, not tmpDir
        expect(() => validateOpenCustomPath("foo.txt", tmpDir)).toThrow(/outside tmpdir/);

        // Near-miss: a sibling directory whose name starts with tmpDir's name
        // must not satisfy the prefix check.
        const sibling = tmpDir + "-evil";
        fs.mkdirSync(sibling);
        try {
            const siblingFile = path.join(sibling, "x.txt");
            fs.writeFileSync(siblingFile, "");
            expect(() => validateOpenCustomPath(siblingFile, tmpDir)).toThrow(/outside tmpdir/);
        } finally {
            fs.rmSync(sibling, { recursive: true, force: true });
        }
    });

    it("rejects nonexistent files inside the sandbox", () => {
        const missing = path.join(tmpDir, "does-not-exist.txt");
        expect(() => validateOpenCustomPath(missing, tmpDir)).toThrow(/does not exist/);
    });

    it("accepts valid paths, including filenames with shell metacharacters", () => {
        expect(validateOpenCustomPath(validFile, tmpDir)).toBe(path.resolve(validFile));
        // Regression for the original `cmd.exe` injection vulnerability.
        expect(validateOpenCustomPath(hostileFile, tmpDir)).toBe(path.resolve(hostileFile));
    });

    it.runIf(process.platform === "win32")(
        "matches tmpdir case-insensitively on Windows",
        () => {
            // Renderer may send the path with different drive-letter / directory casing
            // than os.tmpdir() reports; Windows paths are case-insensitive so this
            // must still pass.
            const mixed = validFile.toUpperCase();
            expect(validateOpenCustomPath(mixed, tmpDir)).toBe(path.resolve(mixed));
        }
    );
});
