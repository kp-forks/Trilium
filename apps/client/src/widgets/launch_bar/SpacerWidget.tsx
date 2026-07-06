import appContext, { CommandNames } from "../../components/app_context";
import FNote from "../../entities/fnote";
import { showLauncherContextMenu } from "../../menus/launcher_button_context_menu";
import type { MenuItem } from "../../menus/context_menu";
import { t } from "../../services/i18n";
import options from "../../services/options";
import { isMobile, reloadFrontendApp } from "../../services/utils";

interface SpacerWidgetProps {
    launcherNote?: FNote;
    baseSize?: number;
    growthFactor?: number;
}

export default function SpacerWidget({ launcherNote, baseSize, growthFactor }: SpacerWidgetProps) {
    return (
        <div
            className="spacer"
            style={{
                flexBasis: baseSize ?? 0,
                flexGrow: growthFactor ?? 1000,
                flexShrink: 1000
            }}
            onContextMenu={launcherNote ? (e) => showLauncherContextMenu<CommandNames>(launcherNote, e, {
                extraItems: buildSpacerContextMenuItems(),
                onCommand: (command) => {
                    if (command) appContext.triggerCommand(command);
                }
            }) : undefined}
        />
    )
}

function buildSpacerContextMenuItems(): MenuItem<CommandNames>[] {
    const items: MenuItem<CommandNames>[] = [{
        title: t("spacer.configure_launchbar"),
        command: "showLaunchBarSubtree",
        uiIcon: "bx " + (isMobile() ? "bx-mobile" : "bx-sidebar")
    }];

    // The layout orientation only applies to the desktop layout; the mobile layout is always horizontal.
    if (!isMobile()) {
        const orientation = options.get("layoutOrientation");
        items.push({
            title: t("spacer.launcher_orientation"),
            uiIcon: "bx bx-layout",
            items: [
                {
                    // The unchecked item triggers a reload when picked, so hint that after its label.
                    title: orientationItemTitle(t("theme.layout-vertical-title"), orientation === "vertical"),
                    // `bx-empty` reserves the icon slot so unchecked items stay aligned with the checked one.
                    uiIcon: "bx bx-empty",
                    checked: orientation === "vertical",
                    handler: () => setLayoutOrientation("vertical")
                },
                {
                    title: orientationItemTitle(t("theme.layout-horizontal-title"), orientation === "horizontal"),
                    uiIcon: "bx bx-empty",
                    checked: orientation === "horizontal",
                    handler: () => setLayoutOrientation("horizontal")
                }
            ]
        });
    }

    return items;
}

function orientationItemTitle(title: string, isCurrent: boolean) {
    return isCurrent ? title : `${title} ${t("spacer.will_reload_frontend")}`;
}

async function setLayoutOrientation(orientation: "vertical" | "horizontal") {
    if (options.get("layoutOrientation") === orientation) {
        return;
    }

    await options.save("layoutOrientation", orientation);
    // The layout tree and body classes are computed once at boot, so a reload is required to apply the change.
    reloadFrontendApp(`layout orientation change: ${orientation}`);
}
