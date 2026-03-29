import { useCallback } from "preact/hooks";

import appContext from "../../components/app_context";
import { t } from "../../services/i18n";
import options from "../../services/options";
import { LaunchBarActionButton } from "./launch_bar_widgets";

/**
 * Launcher button to open the sidebar chat.
 * Opens the right pane if hidden, then activates the chat widget.
 */
export default function SidebarChatButton() {
    const handleClick = useCallback(() => {
        // Ensure right pane is visible
        if (!options.is("rightPaneVisible")) {
            appContext.triggerEvent("toggleRightPane", {});
        }
        // Open the sidebar chat
        appContext.triggerEvent("openSidebarChat", {});
    }, []);

    return (
        <LaunchBarActionButton
            icon="bx bx-message-square-dots"
            text={t("sidebar_chat.launcher_title")}
            onClick={handleClick}
        />
    );
}
