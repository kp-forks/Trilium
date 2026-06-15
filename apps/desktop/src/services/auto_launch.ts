import { getLog, options as optionService, utils as coreUtils } from "@triliumnext/core";
import electron from "electron";
import fs from "fs";
import os from "os";
import path from "path";

// Electron's app.setLoginItemSettings() covers macOS and Windows but is a no-op on
// Linux, where autostart is instead a freedesktop ".desktop" file dropped into the
// per-user autostart directory. We therefore branch on the platform.
const LINUX_AUTOSTART_DIR = path.join(os.homedir(), ".config", "autostart");
const LINUX_DESKTOP_FILE = path.join(LINUX_AUTOSTART_DIR, "trilium.desktop");

// We tag the autostart command so the app can tell, at launch, that it was started
// by the OS at login (and should hide to the tray) rather than launched manually
// (where it must show a window). macOS has no argv hook for login items, so it uses
// the native openAsHidden flag and reports it back via wasOpenedAsHidden instead.
export const START_HIDDEN_FLAG = "--start-hidden";

/**
 * Reconciles the OS autostart entry with the current `launchOnStartup` /
 * `hideOnAutoStart` options. Safe to call repeatedly (it's idempotent) and on every
 * startup, so the OS state is repaired if it drifts. Failures are logged rather than
 * thrown so a permission error (e.g. a read-only autostart dir on Linux) can't take
 * down app startup.
 */
export function applyLaunchOnStartup() {
    try {
        const enabled = optionService.getOptionBool("launchOnStartup");
        const hidden = enabled && optionService.getOptionBool("hideOnAutoStart");

        if (process.platform === "linux") {
            applyLinuxAutostart(enabled, hidden);
        } else {
            // macOS + Windows: handled natively by Electron. `openAsHidden` is the
            // macOS mechanism; `args` is the Windows one. Each platform ignores the
            // option that doesn't apply to it.
            electron.app.setLoginItemSettings({
                openAtLogin: enabled,
                openAsHidden: hidden,
                args: hidden ? [START_HIDDEN_FLAG] : []
            });
        }
    } catch (e) {
        getLog().error(`Failed to apply launch-on-startup setting: ${coreUtils.safeExtractMessageAndStackFromError(e)}`);
    }
}

/**
 * Whether this process was started hidden by the OS at login (vs. launched manually).
 * Used to decide whether the main window should open minimized to the tray.
 */
export function wasLaunchedHidden(): boolean {
    if (process.platform === "darwin") {
        return electron.app.getLoginItemSettings().wasOpenedAsHidden;
    }
    return process.argv.includes(START_HIDDEN_FLAG);
}

/**
 * Registers the IPC the renderer sends after the `launchOnStartup` option changes,
 * so the autostart entry updates immediately without an app restart.
 */
export function setupAutoLaunch() {
    electron.ipcMain.on("reapply-launch-on-startup", applyLaunchOnStartup);
}

function applyLinuxAutostart(enabled: boolean, hidden: boolean) {
    if (enabled) {
        fs.mkdirSync(LINUX_AUTOSTART_DIR, { recursive: true });
        fs.writeFileSync(LINUX_DESKTOP_FILE, buildLinuxDesktopEntry(hidden));
    } else {
        fs.rmSync(LINUX_DESKTOP_FILE, { force: true });
    }
}

function buildLinuxDesktopEntry(hidden: boolean) {
    // When packaged as an AppImage, APPIMAGE points at the bundle to relaunch;
    // otherwise fall back to the running executable.
    const exec = process.env.APPIMAGE ?? process.execPath;
    const execLine = hidden ? `Exec="${exec}" ${START_HIDDEN_FLAG}` : `Exec="${exec}"`;
    return [
        "[Desktop Entry]",
        "Type=Application",
        `Name=${electron.app.getName()}`,
        execLine,
        "Terminal=false",
        "X-GNOME-Autostart-enabled=true",
        ""
    ].join("\n");
}
