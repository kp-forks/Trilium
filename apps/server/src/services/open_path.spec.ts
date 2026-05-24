import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { validateOpenPath } from "./open_path.js";

describe("validateOpenPath", () => {
    let dataDir: string;
    let tmpDir: string;
    let separateTmpDir: string;
    let dataFile: string;
    let tmpFile: string;
    let separateTmpFile: string;

    beforeAll(() => {
        // Simulate the default layout: TMP_DIR is a subdirectory of DATA_DIR.
        dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "trilium-open-path-data-"));
        tmpDir = path.join(dataDir, "tmp");
        fs.mkdirSync(tmpDir);

        // Also simulate the TRILIUM_TMP_DIR-outside-of-data-dir configuration.
        separateTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trilium-open-path-tmp-"));

        dataFile = path.join(dataDir, "config.ini");
        fs.writeFileSync(dataFile, "");
        tmpFile = path.join(tmpDir, "attachment.txt");
        fs.writeFileSync(tmpFile, "");
        separateTmpFile = path.join(separateTmpDir, "attachment.txt");
        fs.writeFileSync(separateTmpFile, "");
    });

    afterAll(() => {
        fs.rmSync(dataDir, { recursive: true, force: true });
        fs.rmSync(separateTmpDir, { recursive: true, force: true });
    });

    it("rejects malformed input", () => {
        expect(() => validateOpenPath(undefined, dataDir, tmpDir)).toThrow(/invalid filePath/);
        expect(() => validateOpenPath(null, dataDir, tmpDir)).toThrow(/invalid filePath/);
        expect(() => validateOpenPath(123, dataDir, tmpDir)).toThrow(/invalid filePath/);
        expect(() => validateOpenPath({}, dataDir, tmpDir)).toThrow(/invalid filePath/);
        expect(() => validateOpenPath("", dataDir, tmpDir)).toThrow(/invalid filePath/);
        expect(() => validateOpenPath(path.join(dataDir, "foo\0.txt"), dataDir, tmpDir))
            .toThrow(/invalid filePath/);
    });

    it("rejects paths outside the sandbox", () => {
        // Absolute path elsewhere on disk
        const outside = process.platform === "win32" ? "C:\\Windows\\Temp\\evil.txt" : "/etc/passwd";
        expect(() => validateOpenPath(outside, dataDir, tmpDir))
            .toThrow(/outside data dir/);

        // ".." traversal escapes the sandbox after path.resolve normalisation
        const traversal = path.join(dataDir, "..", "..", "..", "evil.txt");
        expect(() => validateOpenPath(traversal, dataDir, tmpDir))
            .toThrow(/outside data dir/);

        // Relative paths resolve against cwd, not the data dir
        expect(() => validateOpenPath("foo.txt", dataDir, tmpDir))
            .toThrow(/outside data dir/);

        // Near-miss: sibling directory whose name starts with dataDir's name
        // must not satisfy the prefix check.
        const sibling = dataDir + "-evil";
        fs.mkdirSync(sibling);
        try {
            const siblingFile = path.join(sibling, "x.txt");
            fs.writeFileSync(siblingFile, "");
            expect(() => validateOpenPath(siblingFile, dataDir, tmpDir))
                .toThrow(/outside data dir/);
        } finally {
            fs.rmSync(sibling, { recursive: true, force: true });
        }
    });

    it("rejects UNC paths (the NTLM-credential-theft vector)", () => {
        // UNC paths can never resolve under the data dir, so they're blocked
        // by the sandbox check rather than a dedicated UNC rule.
        if (process.platform === "win32") {
            expect(() => validateOpenPath("\\\\attacker.example\\share\\x", dataDir, tmpDir))
                .toThrow(/outside data dir/);
        }
    });

    it("rejects nonexistent files inside the sandbox", () => {
        const missing = path.join(dataDir, "does-not-exist.txt");
        expect(() => validateOpenPath(missing, dataDir, tmpDir))
            .toThrow(/does not exist/);
    });

    it("accepts the data directory itself (About-dialog 'open data directory' case)", () => {
        expect(validateOpenPath(dataDir, dataDir, tmpDir)).toBe(path.resolve(dataDir));
    });

    it("accepts files under the data directory", () => {
        expect(validateOpenPath(dataFile, dataDir, tmpDir)).toBe(path.resolve(dataFile));
    });

    it("accepts files under the tmp dir (default 'TMP_DIR-is-a-subdir' layout)", () => {
        expect(validateOpenPath(tmpFile, dataDir, tmpDir)).toBe(path.resolve(tmpFile));
    });

    it("accepts files under a TRILIUM_TMP_DIR configured outside the data dir", () => {
        // This is the only reason both dataDir and tmpDir are passed in: when
        // the user sets TRILIUM_TMP_DIR to a custom location, files there
        // would otherwise fail the data-dir sandbox check.
        expect(validateOpenPath(separateTmpFile, dataDir, separateTmpDir))
            .toBe(path.resolve(separateTmpFile));
    });

    it.runIf(process.platform === "win32")(
        "matches sandbox roots case-insensitively on Windows",
        () => {
            expect(validateOpenPath(dataFile.toUpperCase(), dataDir, tmpDir))
                .toBe(path.resolve(dataFile.toUpperCase()));
        }
    );
});
