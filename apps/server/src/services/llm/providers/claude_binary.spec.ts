import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The probe drives the real execFile through util.promisify's callback
// fallback, so the mock receives (binary, args, options, callback).
type ExecFileCallback = (err: Error | null, result?: { stdout: string; stderr: string }) => void;
const execFileMock = vi.hoisted(() => vi.fn<(binary: string, args: string[], options: object, cb: ExecFileCallback) => void>());
vi.mock("child_process", () => ({ execFile: execFileMock }));

const existsSyncMock = vi.hoisted(() => vi.fn(() => true));
vi.mock("fs", () => ({ existsSync: existsSyncMock }));

vi.mock("@triliumnext/core", () => ({ getLog: () => ({ info: vi.fn(), error: vi.fn() }) }));

const { resetClaudeBinaryCache, resolveClaudeBinaryPath } = await import("./claude_binary.js");

describe("resolveClaudeBinaryPath", () => {
    const originalOverride = process.env.TRILIUM_CLAUDE_CODE_PATH;

    beforeEach(() => {
        resetClaudeBinaryCache();
        execFileMock.mockReset();
        existsSyncMock.mockReset();
        existsSyncMock.mockReturnValue(true);
        process.env.TRILIUM_CLAUDE_CODE_PATH = "/opt/claude/claude";
    });

    afterEach(() => {
        if (originalOverride === undefined) {
            delete process.env.TRILIUM_CLAUDE_CODE_PATH;
        } else {
            process.env.TRILIUM_CLAUDE_CODE_PATH = originalOverride;
        }
    });

    function probeSucceeds() {
        execFileMock.mockImplementation((_binary, _args, _options, cb) => cb(null, { stdout: "2.0.1\n", stderr: "" }));
    }

    it("probes the overridden binary once and shares the result across calls (even concurrent ones)", async () => {
        probeSucceeds();

        const [first, second] = await Promise.all([resolveClaudeBinaryPath(), resolveClaudeBinaryPath()]);
        const third = await resolveClaudeBinaryPath();

        expect(first).toBe("/opt/claude/claude");
        expect(second).toBe("/opt/claude/claude");
        expect(third).toBe("/opt/claude/claude");
        expect(execFileMock).toHaveBeenCalledTimes(1);
        expect(execFileMock.mock.calls[0][0]).toBe("/opt/claude/claude");
        expect(execFileMock.mock.calls[0][1]).toEqual(["--version"]);
    });

    it("rejects with an actionable message on a broken binary and re-probes on the next call", async () => {
        execFileMock.mockImplementationOnce((_binary, _args, _options, cb) => cb(new Error("spawn ENOENT")));

        await expect(resolveClaudeBinaryPath()).rejects.toThrow(/failed to run.*claude \/login/s);

        // The failure must not be cached — a later (fixed) install is picked up.
        probeSucceeds();
        await expect(resolveClaudeBinaryPath()).resolves.toBe("/opt/claude/claude");
        expect(execFileMock).toHaveBeenCalledTimes(2);
    });

    it("rejects when TRILIUM_CLAUDE_CODE_PATH points at a missing file, without probing", async () => {
        existsSyncMock.mockReturnValue(false);

        await expect(resolveClaudeBinaryPath()).rejects.toThrow(/TRILIUM_CLAUDE_CODE_PATH/);
        expect(execFileMock).not.toHaveBeenCalled();
    });
});
