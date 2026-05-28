import electron from "electron";
import fs from "fs";
import { t } from "i18next";
import path from "path";

import dataDirs from "@triliumnext/server/src/services/data_dir.js";

const SECURITY_JSON_PATH = path.join(dataDirs.TRILIUM_DATA_DIR, "security.json");

interface SecuritySettings {
    backendScriptingEnabled?: boolean;
    sqlConsoleEnabled?: boolean;
}

function readSettings(): SecuritySettings {
    try {
        if (fs.existsSync(SECURITY_JSON_PATH)) {
            return JSON.parse(fs.readFileSync(SECURITY_JSON_PATH, "utf-8"));
        }
    } catch {
        // Corrupted or unreadable — treat as defaults
    }
    return {};
}

function writeSettings(settings: SecuritySettings): void {
    fs.writeFileSync(SECURITY_JSON_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

/**
 * Reads security settings from `data_dir/security.json`.
 * Called at startup to inject into the server config.
 */
export function getSecuritySettings(): SecuritySettings {
    return readSettings();
}

async function confirmEnable(settingLabel: string, warning: string): Promise<boolean> {
    const result = await electron.dialog.showMessageBox({
        type: "warning",
        buttons: [t("security-dialog.cancel"), t("security-dialog.enable")],
        defaultId: 0,
        cancelId: 0,
        title: t("security-dialog.enable-title", { settingLabel }),
        message: t("security-dialog.enable-message", { settingLabel }),
        detail: t("security-dialog.enable-detail", { warning })
    });

    return result.response === 1;
}

async function confirmDisable(settingLabel: string): Promise<boolean> {
    const result = await electron.dialog.showMessageBox({
        type: "info",
        buttons: [t("security-dialog.cancel"), t("security-dialog.disable")],
        defaultId: 1,
        cancelId: 0,
        title: t("security-dialog.disable-title", { settingLabel }),
        message: t("security-dialog.disable-message", { settingLabel }),
        detail: t("security-dialog.disable-detail")
    });

    return result.response === 1;
}

export function registerSecurityIpcHandlers(): void {
    electron.ipcMain.handle("security-set-backend-scripting", async (_event, enabled: boolean) => {
        const confirmed = enabled
            ? await confirmEnable(t("security-dialog.backend-scripting"), t("security-dialog.backend-scripting-warning"))
            : await confirmDisable(t("security-dialog.backend-scripting"));
        if (!confirmed) {
            return false;
        }

        const settings = readSettings();
        settings.backendScriptingEnabled = enabled;
        writeSettings(settings);
        return true;
    });

    electron.ipcMain.handle("security-set-sql-console", async (_event, enabled: boolean) => {
        const confirmed = enabled
            ? await confirmEnable(t("security-dialog.sql-console"), t("security-dialog.sql-console-warning"))
            : await confirmDisable(t("security-dialog.sql-console"));
        if (!confirmed) {
            return false;
        }

        const settings = readSettings();
        settings.sqlConsoleEnabled = enabled;
        writeSettings(settings);
        return true;
    });
}
