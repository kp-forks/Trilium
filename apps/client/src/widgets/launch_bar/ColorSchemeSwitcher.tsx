import "./ColorSchemeSwitcher.css";

import { ColorScheme, getNextColorSchemeTheme, resolveColorScheme } from "../../services/color_scheme";
import { t } from "../../services/i18n";
import { useTriliumOption } from "../react/hooks";
import { LaunchBarActionButton, LauncherNoteProps } from "./launch_bar_widgets";

const SCHEME_ICONS: Record<ColorScheme, string> = {
    system: "bx bx-brightness-half",
    light: "bx bx-sun",
    dark: "bx bx-moon"
};

const SCHEME_LABELS: Record<ColorScheme, string> = {
    system: t("theme.color_scheme_switcher_system"),
    light: t("theme.color_scheme_switcher_light"),
    dark: t("theme.color_scheme_switcher_dark")
};

export default function ColorSchemeSwitcher({ launcherNote }: LauncherNoteProps) {
    const [ theme, setTheme ] = useTriliumOption("theme");
    const { scheme, isCustom } = resolveColorScheme(theme);

    const tooltip = isCustom
        ? t("theme.color_scheme_switcher_unsupported")
        : `<span class="mode">${SCHEME_LABELS[scheme]}</span><span class="hint">${t("theme.color_scheme_switcher_hint")}</span>`;

    return (
        <LaunchBarActionButton
            launcherNote={launcherNote}
            className={`color-scheme-switcher${isCustom ? " unsupported" : ""}`}
            icon={SCHEME_ICONS[scheme]}
            text={tooltip}
            tooltipHtml
            tooltipClass="color-scheme-switcher-tooltip"
            onClick={() => {
                const nextTheme = getNextColorSchemeTheme(theme);
                if (nextTheme) {
                    void setTheme(nextTheme);
                }
            }}
        />
    );
}
