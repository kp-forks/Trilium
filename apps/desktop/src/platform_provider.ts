import { PlatformProvider, t } from "@triliumnext/core";
import electron from "electron";

export default class DesktopPlatformProvider implements PlatformProvider {
    crash(message: string): void {
        electron.dialog.showErrorBox(t("modals.error_title"), message);
        electron.app.exit(1);
    }
}
