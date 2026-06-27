import type { ExportFormat } from "@triliumnext/core";
import { getLog, utils as coreUtils, zipExportService } from "@triliumnext/core";
import type { NativeExportResult } from "@triliumnext/commons";
import { default as electron } from "electron";
import fs from "fs/promises";
import { t } from "i18next";

interface ExportSubtreeOpts {
    branchId: string;
    format: string;
    title: string;
    taskId: string;
}

/**
 * Registers the desktop-native subtree export IPC handler. Instead of streaming a
 * (potentially multi-GB) archive through an in-memory HTTP response — which
 * Electron's download manager buffers whole — this prompts a save dialog and
 * streams the export straight to the chosen file with bounded memory.
 */
export function setupExportHandlers() {
    electron.ipcMain.handle("export-subtree-to-file", async (_e, { branchId, format, title, taskId }: ExportSubtreeOpts): Promise<NativeExportResult> => {
        const focusedWindow = electron.BrowserWindow.getFocusedWindow();
        if (!focusedWindow) {
            return { status: "cancelled" };
        }

        const filePath = electron.dialog.showSaveDialogSync(focusedWindow, {
            defaultPath: coreUtils.formatDownloadTitle(title, "file", "application/zip"),
            filters: [{ name: t("export.zip_filter"), extensions: ["zip"] }]
        });
        if (!filePath) {
            return { status: "cancelled" };
        }

        try {
            await zipExportService.exportBranchToZipFile(branchId, format as ExportFormat, filePath, taskId);
            return { status: "saved", filePath };
        } catch (e) {
            // Remove the partial/incomplete archive left at the destination.
            await fs.rm(filePath, { force: true });
            getLog().error(`Native subtree export failed: ${coreUtils.safeExtractMessageAndStackFromError(e)}`);
            return { status: "error", message: e instanceof Error ? e.message : String(e) };
        }
    });
}
