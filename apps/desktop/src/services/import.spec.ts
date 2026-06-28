import { beforeEach, describe, expect, it, vi } from "vitest";

// --- electron mock: capture the IPC handlers and drive the dialog/window from the test ---
const electronMock = vi.hoisted(() => ({
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => electronMock.handlers.set(channel, handler)),
    showOpenDialog: vi.fn<(...args: unknown[]) => Promise<{ canceled: boolean; filePaths: string[] }>>(),
    getFocusedWindow: vi.fn<() => object | null>(() => ({}))
}));

vi.mock("electron", () => ({
    default: {
        ipcMain: { handle: electronMock.handle },
        dialog: { showOpenDialog: electronMock.showOpenDialog },
        BrowserWindow: { getFocusedWindow: electronMock.getFocusedWindow }
    }
}));

/** Resolves the open-dialog mock to a user selection (or a cancel) the way Electron's async dialog does. */
function dialogReturns(filePaths: string[] | undefined) {
    electronMock.showOpenDialog.mockResolvedValue(
        filePaths && filePaths.length ? { canceled: false, filePaths } : { canceled: true, filePaths: [] }
    );
}

vi.mock("i18next", () => ({ t: (key: string) => key }));

// --- fs mock: the handler reads non-zip files into a buffer; zips are read in place (no readFile) ---
const fsMock = vi.hoisted(() => ({ readFile: vi.fn<(...args: unknown[]) => Promise<Buffer>>(async () => Buffer.from("data")) }));
vi.mock("fs/promises", () => ({ readFile: fsMock.readFile }));

// --- core mock: stub the dispatch pipeline so we can assert what the handler calls ---
const coreMock = vi.hoisted(() => ({
    dispatch: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    getNoteOrThrow: vi.fn((id: string) => ({ noteId: id })),
    taskSucceeded: vi.fn(),
    reportError: vi.fn(),
    load: vi.fn(),
    tokenCounter: 0
}));

vi.mock("@triliumnext/core", () => ({
    becca: { getNoteOrThrow: coreMock.getNoteOrThrow },
    becca_loader: { load: coreMock.load },
    cls: {
        init: (cb: () => unknown) => cb(),
        disableEntityEvents: vi.fn(),
        ignoreEntityChangeIds: vi.fn()
    },
    getLog: () => ({ error: vi.fn() }),
    TaskContext: { getInstance: () => ({ taskSucceeded: coreMock.taskSucceeded, reportError: coreMock.reportError }) },
    utils: {
        randomString: () => `tok-${coreMock.tokenCounter++}`,
        safeExtractMessageAndStackFromError: (e: unknown) => String(e)
    },
    importDispatchService: coreMock.dispatch
}));

const { setupImportHandlers } = await import("./import.js");

const OPTIONS = {
    safeImport: true, shrinkImages: false, textImportedAsText: true, codeImportedAsCode: true,
    spreadsheetImportedAsSpreadsheet: true, explodeArchives: true, replaceUnderscoresWithSpaces: true
};

function pick() {
    return electronMock.handlers.get("import-pick-files")?.() as Promise<{ status: string; files?: { token: string; fileName: string }[] }>;
}
function importFromToken(opts: object) {
    return electronMock.handlers.get("import-from-token")?.({}, opts) as Promise<{ status: string; importedNoteId?: string; message?: string }>;
}

describe("desktop native import — capability token", () => {
    beforeEach(() => {
        electronMock.handlers.clear();
        vi.clearAllMocks();
        coreMock.tokenCounter = 0;
        coreMock.dispatch.mockResolvedValue({ noteId: "imported1" });
        fsMock.readFile.mockResolvedValue(Buffer.from("data"));
        electronMock.getFocusedWindow.mockReturnValue({});
        setupImportHandlers();
    });

    it("pick returns tokens + filenames (never paths) for the user-chosen files", async () => {
        dialogReturns(["C:/Users/me/big vault.zip", "C:/Users/me/notes.md"]);

        const result = await pick();

        expect(result.status).toBe("selected");
        expect(result.files).toHaveLength(2);
        expect(result.files?.map((f) => f.fileName)).toEqual(["big vault.zip", "notes.md"]);
        expect(result.files?.every((f) => !!f.token)).toBe(true);
        // The renderer is handed tokens, not absolute paths.
        expect(JSON.stringify(result)).not.toContain("C:/Users/me");
    });

    it("a cancelled dialog mints no token and imports nothing", async () => {
        dialogReturns(undefined);

        expect(await pick()).toEqual({ status: "cancelled" });
        expect(coreMock.dispatch).not.toHaveBeenCalled();
    });

    it("imports a granted zip in place (dispatch receives a { path } file, never read into a buffer)", async () => {
        vi.useFakeTimers();
        try {
            dialogReturns(["/data/big.zip"]);
            const { files } = await pick();
            const token = files?.[0].token;

            const result = await importFromToken({ token, parentNoteId: "parent1", taskId: "task1", options: OPTIONS, last: true });

            expect(result).toEqual({ status: "imported", importedNoteId: "imported1" });
            expect(coreMock.getNoteOrThrow).toHaveBeenCalledWith("parent1");
            // A zip is streamed from disk: the file carries its path, an empty buffer, and isn't read here.
            const [, file, parentNote] = coreMock.dispatch.mock.calls[0];
            expect(file).toMatchObject({ originalname: "big.zip", path: "/data/big.zip" });
            expect((file as { buffer: Buffer }).buffer.length).toBe(0);
            expect(fsMock.readFile).not.toHaveBeenCalled();
            expect(parentNote).toEqual({ noteId: "parent1" });
            expect(coreMock.load).toHaveBeenCalled();
            // Success is reported on a short delay (lets the transaction commit first).
            await vi.advanceTimersByTimeAsync(1000);
            expect(coreMock.taskSucceeded).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("reads a granted non-zip file into a buffer before dispatching", async () => {
        dialogReturns(["/data/note.md"]);
        fsMock.readFile.mockResolvedValue(Buffer.from("# hello"));
        const { files } = await pick();

        await importFromToken({ token: files?.[0].token, parentNoteId: "p", taskId: "t", options: OPTIONS, last: true });

        expect(fsMock.readFile).toHaveBeenCalledWith("/data/note.md");
        const [, file] = coreMock.dispatch.mock.calls[0];
        expect(file).toMatchObject({ originalname: "note.md", path: "/data/note.md" });
        expect((file as { buffer: Buffer }).buffer.toString()).toBe("# hello");
    });

    it("fires the success toast only on the last file of a batch", async () => {
        vi.useFakeTimers();
        try {
            dialogReturns(["/data/a.md", "/data/b.md"]);
            const { files } = await pick();

            await importFromToken({ token: files?.[0].token, parentNoteId: "p", taskId: "t", options: OPTIONS, last: false });
            await vi.advanceTimersByTimeAsync(1000);
            expect(coreMock.taskSucceeded).not.toHaveBeenCalled();

            await importFromToken({ token: files?.[1].token, parentNoteId: "p", taskId: "t", options: OPTIONS, last: true });
            await vi.advanceTimersByTimeAsync(1000);
            expect(coreMock.taskSucceeded).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("forwards a provider format and still streams the tagged zip from path (not read into a buffer)", async () => {
        dialogReturns(["/data/vault.zip"]);
        const { files } = await pick();

        await importFromToken({ token: files?.[0].token, parentNoteId: "p", taskId: "t", options: OPTIONS, last: true, format: "obsidian" });

        const [, file, , , format] = coreMock.dispatch.mock.calls[0];
        expect(format).toBe("obsidian");
        // A tagged provider zip is streamed in place: empty buffer + path, never read here.
        expect(file).toMatchObject({ originalname: "vault.zip", path: "/data/vault.zip" });
        expect((file as { buffer: Buffer }).buffer.length).toBe(0);
        expect(fsMock.readFile).not.toHaveBeenCalled();
    });

    it("rejects an unknown/forged token without importing (a script can't supply a path or guess a token)", async () => {
        const result = await importFromToken({ token: "forged-token", parentNoteId: "parent1", taskId: "t", options: OPTIONS, last: true });

        expect(result.status).toBe("error");
        expect(coreMock.dispatch).not.toHaveBeenCalled();
    });

    it("consumes the token: the same token cannot be redeemed twice (no replay)", async () => {
        dialogReturns(["/data/once.zip"]);
        const { files } = await pick();
        const token = files?.[0].token;

        const first = await importFromToken({ token, parentNoteId: "p", taskId: "t", options: OPTIONS, last: true });
        const second = await importFromToken({ token, parentNoteId: "p", taskId: "t", options: OPTIONS, last: true });

        expect(first.status).toBe("imported");
        expect(second.status).toBe("error");
        expect(coreMock.dispatch).toHaveBeenCalledTimes(1);
    });

    it("reports a failed import as an error and surfaces it on the task channel", async () => {
        dialogReturns(["/data/bad.zip"]);
        coreMock.dispatch.mockRejectedValue(new Error("corrupt archive"));
        const { files } = await pick();

        const result = await importFromToken({ token: files?.[0].token, parentNoteId: "p", taskId: "t", options: OPTIONS, last: true });

        expect(result).toEqual({ status: "error", message: "corrupt archive" });
        expect(coreMock.reportError).toHaveBeenCalledWith("corrupt archive");
    });

    it("surfaces an OPML structured failure (the [status, message] tuple) as an error", async () => {
        dialogReturns(["/data/bad.opml"]);
        coreMock.dispatch.mockResolvedValue([400, "Unsupported OPML version"]);
        const { files } = await pick();

        const result = await importFromToken({ token: files?.[0].token, parentNoteId: "p", taskId: "t", options: OPTIONS, last: true });

        expect(result).toEqual({ status: "error", message: "Unsupported OPML version" });
        expect(coreMock.reportError).toHaveBeenCalledWith("Unsupported OPML version");
    });
});
