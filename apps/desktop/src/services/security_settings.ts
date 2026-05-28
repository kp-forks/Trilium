import electron from "electron";
import fs from "fs";
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

async function confirmToggle(settingLabel: string, enabled: boolean): Promise<boolean> {
    const message = enabled
        ? `Are you sure you want to enable ${settingLabel}?\n\nThis change requires a restart to take effect.`
        : `${settingLabel} will be disabled.\n\nThis change requires a restart to take effect.`;

    const result = await electron.dialog.showMessageBox({
        type: enabled ? "warning" : "question",
        buttons: ["Cancel", enabled ? "Enable" : "Disable"],
        defaultId: 0,
        cancelId: 0,
        title: `${enabled ? "Enable" : "Disable"} ${settingLabel}`,
        message
    });

    return result.response === 1;
}

export function registerSecurityIpcHandlers(): void {
    electron.ipcMain.handle("security-set-backend-scripting", async (_event, enabled: boolean) => {
        const confirmed = await confirmToggle("backend script execution", enabled);
        if (!confirmed) {
            return false;
        }

        const settings = readSettings();
        settings.backendScriptingEnabled = enabled;
        writeSettings(settings);
        return true;
    });

    electron.ipcMain.handle("security-set-sql-console", async (_event, enabled: boolean) => {
        const confirmed = await confirmToggle("SQL console", enabled);
        if (!confirmed) {
            return false;
        }

        const settings = readSettings();
        settings.sqlConsoleEnabled = enabled;
        writeSettings(settings);
        return true;
    });
}
