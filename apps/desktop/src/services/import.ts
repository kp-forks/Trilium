import type { NativeImportOptions, NativeImportPickResult, NativeImportResult } from "@triliumnext/commons";
import { becca, becca_loader, cls, getLog, TaskContext, utils as coreUtils, zipImportService } from "@triliumnext/core";
import { default as electron } from "electron";
import { basename } from "path";
import { t } from "i18next";

interface ImportFromTokenOpts {
    token: string;
    parentNoteId: string;
    taskId: string;
    options: NativeImportOptions;
}

/**
 * Registers the desktop-native large-`.zip` import IPC handlers.
 *
 * Security model: the renderer **never** supplies a path. The OS dialog runs here in the main process and
 * is the *only* thing that mints an access grant; `import-pick-zip` returns a single-use, short-lived
 * **token** (plus the display filename), and `import-from-token` accepts that token — not a path. So a
 * note script can at most pop the dialog (the user still has to pick a file) and can never read an
 * arbitrary file: it can't forge a valid token, and there's no path parameter to abuse.
 *
 * The chosen file is read **in place** (`zipImportService.importZip({ path })`, streamed per entry), so a
 * multi-GB archive is never copied to a temp file or held in memory — the reason this path exists.
 */
export function setupImportHandlers() {
    electron.ipcMain.handle("import-pick-zip", async (): Promise<NativeImportPickResult> => {
        const focusedWindow = electron.BrowserWindow.getFocusedWindow();
        if (!focusedWindow) {
            return { status: "cancelled" };
        }

        const selection = electron.dialog.showOpenDialogSync(focusedWindow, {
            properties: ["openFile"],
            filters: [{ name: t("import.zip_filter"), extensions: ["zip"] }]
        });
        if (!selection || selection.length === 0) {
            return { status: "cancelled" };
        }

        const path = selection[0];
        return { status: "selected", token: grantFileAccess(path), fileName: basename(path) };
    });

    electron.ipcMain.handle("import-from-token", async (_e, opts: ImportFromTokenOpts): Promise<NativeImportResult> => {
        const path = redeemFileAccess(opts.token);
        if (!path) {
            return { status: "error", message: t("import.invalid_file_grant") };
        }

        try {
            return { status: "imported", importedNoteId: await runZipImport(path, opts) };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            TaskContext.getInstance(opts.taskId, "importNotes", opts.options).reportError(message);
            getLog().error(`Native zip import failed: ${coreUtils.safeExtractMessageAndStackFromError(e)}`);
            return { status: "error", message };
        }
    });
}

// token -> { absolute path, expiry }. A grant is the capability handed to the renderer in place of a path.
const fileGrants = new Map<string, { path: string; expiresAt: number }>();
const GRANT_TTL_MS = 5 * 60 * 1000;

/** Mints a single-use, time-limited token for a path the *user* picked in the OS dialog. */
function grantFileAccess(path: string): string {
    const token = coreUtils.randomString(32);
    fileGrants.set(token, { path, expiresAt: Date.now() + GRANT_TTL_MS });
    return token;
}

/** Resolves and consumes a token (single-use); returns null if unknown or expired. */
function redeemFileAccess(token: string): string | null {
    const grant = fileGrants.get(token);
    fileGrants.delete(token);
    if (!grant || grant.expiresAt < Date.now()) {
        return null;
    }
    return grant.path;
}

/** Imports the zip at `path` in place, reporting progress/success over the WebSocket like the HTTP route. */
async function runZipImport(path: string, opts: ImportFromTokenOpts): Promise<string | undefined> {
    const parentNote = becca.getNoteOrThrow(opts.parentNoteId);
    const taskContext = TaskContext.getInstance(opts.taskId, "importNotes", opts.options);

    const note = await cls.init(async () => {
        // Match the HTTP import route: skip per-entity events and change-id tracking during the bulk import.
        cls.disableEntityEvents();
        cls.ignoreEntityChangeIds();
        const importedNote = await zipImportService.importZip(taskContext, { path }, parentNote);

        // Import ran with entity events disabled, so becca wasn't updated incrementally — force a reload.
        // Must run inside the CLS context: becca_loader.load() toggles slow-query logging via the namespace.
        becca_loader.load();
        return importedNote;
    });

    // Small delay mirrors the route: let the transaction commit before the client reacts to success.
    setTimeout(() => taskContext.taskSucceeded({ parentNoteId: opts.parentNoteId, importedNoteId: note?.noteId }), 1000);

    return note?.noteId;
}
