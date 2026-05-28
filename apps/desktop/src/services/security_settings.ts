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

async function confirmEnable(settingLabel: string, warning: string): Promise<boolean> {
    const result = await electron.dialog.showMessageBox({
        type: "warning",
        buttons: ["Cancel", "Enable"],
        defaultId: 0,
        cancelId: 0,
        title: `Enable ${settingLabel}`,
        message: `Are you sure you want to enable ${settingLabel}?`,
        detail: `${warning}\n\nOnly enable this if you explicitly intend to use this feature. Do not enable it if prompted by a script or an unfamiliar note.\n\nThis change requires a restart to take effect.`
    });

    return result.response === 1;
}

async function confirmDisable(settingLabel: string): Promise<boolean> {
    const result = await electron.dialog.showMessageBox({
        type: "info",
        buttons: ["Cancel", "Disable"],
        defaultId: 1,
        cancelId: 0,
        title: `Disable ${settingLabel}`,
        message: `${settingLabel} will be disabled.`,
        detail: "This change requires a restart to take effect."
    });

    return result.response === 1;
}

export function registerSecurityIpcHandlers(): void {
    electron.ipcMain.handle("security-set-backend-scripting", async (_event, enabled: boolean) => {
        const confirmed = enabled
            ? await confirmEnable("Backend script execution",
                "Backend scripts have full access to the server, including the file system and network.")
            : await confirmDisable("Backend script execution");
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
            ? await confirmEnable("SQL console",
                "The SQL console allows executing arbitrary SQL queries against the database.")
            : await confirmDisable("SQL console");
        if (!confirmed) {
            return false;
        }

        const settings = readSettings();
        settings.sqlConsoleEnabled = enabled;
        writeSettings(settings);
        return true;
    });
}
