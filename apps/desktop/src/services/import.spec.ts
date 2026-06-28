import { beforeEach, describe, expect, it, vi } from "vitest";

// --- electron mock: capture the IPC handlers and drive the dialog/window from the test ---
const electronMock = vi.hoisted(() => ({
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => electronMock.handlers.set(channel, handler)),
    showOpenDialogSync: vi.fn<(...args: unknown[]) => string[] | undefined>(),
    getFocusedWindow: vi.fn<() => object | null>(() => ({}))
}));

vi.mock("electron", () => ({
    default: {
        ipcMain: { handle: electronMock.handle },
        dialog: { showOpenDialogSync: electronMock.showOpenDialogSync },
        BrowserWindow: { getFocusedWindow: electronMock.getFocusedWindow }
    }
}));

vi.mock("i18next", () => ({ t: (key: string) => key }));

// --- core mock: stub the import pipeline so we can assert what the handler calls ---
const coreMock = vi.hoisted(() => ({
    importZip: vi.fn<(...args: unknown[]) => Promise<{ noteId: string }>>(),
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
    zipImportService: { importZip: coreMock.importZip }
}));

const { setupImportHandlers } = await import("./import.js");

const OPTIONS = {
    safeImport: true, shrinkImages: false, textImportedAsText: true, codeImportedAsCode: true,
    spreadsheetImportedAsSpreadsheet: true, explodeArchives: true, replaceUnderscoresWithSpaces: true
};

function pick() {
    return electronMock.handlers.get("import-pick-zip")?.() as Promise<{ status: string; token?: string; fileName?: string }>;
}
function importFromToken(opts: object) {
    return electronMock.handlers.get("import-from-token")?.({}, opts) as Promise<{ status: string; importedNoteId?: string; message?: string }>;
}

describe("desktop native import — capability token", () => {
    beforeEach(() => {
        electronMock.handlers.clear();
        vi.clearAllMocks();
        coreMock.tokenCounter = 0;
        coreMock.importZip.mockResolvedValue({ noteId: "imported1" });
        electronMock.getFocusedWindow.mockReturnValue({});
        setupImportHandlers();
    });

    it("pick-zip returns a token + filename (never a path) for the user-chosen file", async () => {
        electronMock.showOpenDialogSync.mockReturnValue(["C:/Users/me/big vault.zip"]);

        const result = await pick();

        expect(result.status).toBe("selected");
        expect(result.token).toBeTruthy();
        expect(result.fileName).toBe("big vault.zip");
        // The renderer is handed a token, not the absolute path.
        expect(JSON.stringify(result)).not.toContain("C:/Users/me");
    });

    it("a cancelled dialog mints no token and imports nothing", async () => {
        electronMock.showOpenDialogSync.mockReturnValue(undefined);

        expect(await pick()).toEqual({ status: "cancelled" });
        expect(coreMock.importZip).not.toHaveBeenCalled();
    });

    it("imports the granted file in place (importZip receives { path }, not bytes)", async () => {
        electronMock.showOpenDialogSync.mockReturnValue(["/data/big.zip"]);
        const { token } = await pick();

        const result = await importFromToken({ token, parentNoteId: "parent1", taskId: "task1", options: OPTIONS });

        expect(result).toEqual({ status: "imported", importedNoteId: "imported1" });
        expect(coreMock.getNoteOrThrow).toHaveBeenCalledWith("parent1");
        const [, source, parentNote] = coreMock.importZip.mock.calls[0];
        expect(source).toEqual({ path: "/data/big.zip" });
        expect(parentNote).toEqual({ noteId: "parent1" });
        expect(coreMock.load).toHaveBeenCalled();
    });

    it("rejects an unknown/forged token without importing (a script can't supply a path or guess a token)", async () => {
        const result = await importFromToken({ token: "forged-token", parentNoteId: "parent1", taskId: "t", options: OPTIONS });

        expect(result.status).toBe("error");
        expect(coreMock.importZip).not.toHaveBeenCalled();
    });

    it("consumes the token: the same token cannot be redeemed twice (no replay)", async () => {
        electronMock.showOpenDialogSync.mockReturnValue(["/data/once.zip"]);
        const { token } = await pick();

        const first = await importFromToken({ token, parentNoteId: "p", taskId: "t", options: OPTIONS });
        const second = await importFromToken({ token, parentNoteId: "p", taskId: "t", options: OPTIONS });

        expect(first.status).toBe("imported");
        expect(second.status).toBe("error");
        expect(coreMock.importZip).toHaveBeenCalledTimes(1);
    });

    it("reports a failed import as an error and surfaces it on the task channel", async () => {
        electronMock.showOpenDialogSync.mockReturnValue(["/data/bad.zip"]);
        coreMock.importZip.mockRejectedValue(new Error("corrupt archive"));
        const { token } = await pick();

        const result = await importFromToken({ token, parentNoteId: "p", taskId: "t", options: OPTIONS });

        expect(result).toEqual({ status: "error", message: "corrupt archive" });
        expect(coreMock.reportError).toHaveBeenCalledWith("corrupt archive");
    });
});
