import { BUILTIN_ATTRIBUTES } from "@triliumnext/commons";
import clsx from "clsx";
import { useEffect, useState } from "preact/hooks";

import FNote from "../../entities/fnote";
import attributes from "../../services/attributes";
import { t } from "../../services/i18n";
import { openInAppHelpFromUrl } from "../../services/utils";
import { BadgeWithDropdown } from "../react/Badge";
import { FormDropdownDivider, FormListItem } from "../react/FormList";
import FormToggle from "../react/FormToggle";
import { useNoteContext, useNoteLabelBoolean, useTriliumEvent } from "../react/hooks";
import { BookProperty, ViewProperty } from "../react/NotePropertyMenu";

const NON_DANGEROUS_ACTIVE_CONTENT = [ "appCss", "appTheme" ];
const DANGEROUS_ATTRIBUTES = BUILTIN_ATTRIBUTES.filter(a => a.isDangerous || NON_DANGEROUS_ACTIVE_CONTENT.includes(a.name));
const activeContentLabels = [ "iconPack", "widget", "appCss", "appTheme" ] as const;

interface ActiveContentInfo {
    type: "iconPack" | "backendScript" | "frontendScript" | "widget" | "appCss" | "renderNote" | "webView" | "appTheme";
    isEnabled: boolean;
    canToggleEnabled: boolean;
}

const executeOption: BookProperty = {
    type: "button",
    icon: "bx bx-play",
    label: t("active_content_badges.menu_execute_now"),
    onClick: context => context.triggerCommand("runActiveNote")
};

const typeMappings: Record<ActiveContentInfo["type"], {
    icon: string;
    helpPage: string;
    apiDocsPage?: string;
    isExecutable?: boolean;
    additionalOptions?: BookProperty[];
}> = {
    iconPack: {
        icon: "bx bx-package",
        helpPage: "g1mlRoU8CsqC",
    },
    backendScript: {
        icon: "bx bx-server",
        helpPage: "SPirpZypehBG",
        apiDocsPage: "MEtfsqa5VwNi",
        isExecutable: true,
        additionalOptions: [
            executeOption,
            {
                type: "combobox",
                bindToLabel: "run",
                label: t("active_content_badges.menu_run"),
                icon: "bx bx-rss",
                dropStart: true,
                options: [
                    { value: null, label: t("active_content_badges.menu_run_disabled") },
                    { value: "backendStartup", label: t("active_content_badges.menu_run_backend_startup") },
                    { value: "daily", label: t("active_content_badges.menu_run_daily") },
                    { value: "hourly", label: t("active_content_badges.menu_run_hourly") }
                ]
            }
        ]
    },
    frontendScript: {
        icon: "bx bx-window",
        helpPage: "yIhgI5H7A2Sm",
        apiDocsPage: "Q2z6av6JZVWm",
        isExecutable: true,
        additionalOptions: [
            executeOption,
            {
                type: "combobox",
                bindToLabel: "run",
                label: t("active_content_badges.menu_run"),
                icon: "bx bx-rss",
                dropStart: true,
                options: [
                    { value: null, label: t("active_content_badges.menu_run_disabled") },
                    { value: "frontendStartup", label: t("active_content_badges.menu_run_frontend_startup") },
                    { value: "mobileStartup", label: t("active_content_badges.menu_run_mobile_startup") }
                ]
            }
        ]
    },
    widget: {
        icon: "bx bxs-widget",
        helpPage: "MgibgPcfeuGz"
    },
    appCss: {
        icon: "bx bxs-file-css",
        helpPage: "AlhDUqhENtH7"
    },
    renderNote: {
        icon: "bx bx-extension",
        helpPage: "HcABDtFCkbFN"
    },
    webView: {
        icon: "bx bx-globe",
        helpPage: "1vHRoWCEjj0L"
    },
    appTheme: {
        icon: "bx bx-palette",
        helpPage: "7NfNr5pZpVKV",
        additionalOptions: [
            {
                type: "combobox",
                bindToLabel: "appThemeBase",
                label: t("active_content_badges.menu_theme_base"),
                icon: "bx bx-layer",
                dropStart: true,
                options: [
                    { label: t("theme.auto_theme"), value: null },
                    { type: "separator" },
                    { label: t("theme.triliumnext"), value: "next" },
                    { label: t("theme.triliumnext-light"), value: "next-light" },
                    { label: t("theme.triliumnext-dark"), value: "next-dark" }
                ]
            }
        ]
    }
};

export function ActiveContentBadges() {
    const { note } = useNoteContext();
    const info = useActiveContentInfo(note);

    return (note && info &&
        <>
            {info.canToggleEnabled && <ActiveContentToggle info={info} note={note} />}
            <ActiveContentBadge info={info} note={note} />
        </>
    );
}

function ActiveContentBadge({ info, note }: { note: FNote, info: ActiveContentInfo }) {
    const { icon, helpPage, apiDocsPage, additionalOptions } = typeMappings[info.type];
    return (
        <BadgeWithDropdown
            className={clsx("active-content-badge", info.canToggleEnabled && !info.isEnabled && "disabled")}
            icon={icon}
            text={getTranslationForType(info.type)}
        >
            {(info.type === "frontendScript" || info.type === "widget") && (
                <>
                    <WidgetSwitcher note={note} />
                    <FormDropdownDivider />
                </>
            )}

            {additionalOptions?.length && (
                <>
                    {additionalOptions?.map((property, i) => (
                        <ViewProperty key={i} note={note} property={property} />
                    ))}
                    <FormDropdownDivider />
                </>
            )}

            <FormListItem
                icon="bx bx-help-circle"
                onClick={() => openInAppHelpFromUrl(helpPage)}
            >{t("active_content_badges.menu_docs")}</FormListItem>

            {apiDocsPage && <FormListItem
                icon="bx bx-book-content"
                onClick={() => openInAppHelpFromUrl(apiDocsPage)}
            >{t("code_buttons.trilium_api_docs_button_title")}</FormListItem>}
        </BadgeWithDropdown>
    );
}

function WidgetSwitcher({ note }: { note: FNote }) {
    const [ widget, setWidget ] = useNoteLabelBoolean(note, "widget");
    const [ disabledWidget, setDisabledWidget ] = useNoteLabelBoolean(note, "disabled:widget");

    return (widget || disabledWidget)
        ? <FormListItem
            icon="bx bx-window"
            onClick={() => {
                setWidget(false);
                setDisabledWidget(false);
            }}
        >{t("active_content_badges.menu_change_to_frontend_script")}</FormListItem>
        : <FormListItem
            icon={widget ? "bx bx-window" : "bx bxs-widget"}
            onClick={() => {
                setWidget(true);
            }}
        >{t("active_content_badges.menu_change_to_widget")}</FormListItem>;

}

function getTranslationForType(type: ActiveContentInfo["type"]) {
    switch (type) {
        case "iconPack":
            return t("active_content_badges.type_icon_pack");
        case "backendScript":
            return t("active_content_badges.type_backend_script");
        case "frontendScript":
            return t("active_content_badges.type_frontend_script");
        case "widget":
            return t("active_content_badges.type_widget");
        case "appCss":
            return t("active_content_badges.type_app_css");
        case "renderNote":
            return t("active_content_badges.type_render_note");
        case "webView":
            return t("active_content_badges.type_web_view");
        case "appTheme":
            return t("active_content_badges.type_app_theme");
    }
}

function ActiveContentToggle({ note, info }: { note: FNote, info: ActiveContentInfo }) {
    const typeTranslation = getTranslationForType(info.type);

    return info && <FormToggle
        switchOnName="" switchOffName=""
        currentValue={info.isEnabled}
        switchOffTooltip={t("active_content_badges.toggle_tooltip_disable_tooltip", { type: typeTranslation })}
        switchOnTooltip={t("active_content_badges.toggle_tooltip_enable_tooltip", { type: typeTranslation })}
        onChange={async (willEnable) => {
            const attrs = note.getOwnedAttributes()
                .filter(attr => {
                    if (attr.isInheritable) return false;
                    const baseName = getNameWithoutPrefix(attr.name);
                    return DANGEROUS_ATTRIBUTES.some(item => item.name === baseName && item.type === attr.type);
                });

            for (const attr of attrs) {
                const baseName = getNameWithoutPrefix(attr.name);
                const newName = willEnable ? baseName : `disabled:${baseName}`;
                if (newName === attr.name) continue;

                // We are adding and removing afterwards to avoid a flicker (because for a moment there would be no active content attribute anymore) because the operations are done in sequence and not atomically.
                if (attr.type === "label") {
                    await attributes.setLabel(note.noteId, newName, attr.value);
                } else {
                    await attributes.setRelation(note.noteId, newName, attr.value);
                }
                await attributes.removeAttributeById(note.noteId, attr.attributeId);
            }
        }}
    />;
}

function getNameWithoutPrefix(name: string) {
    return name.startsWith("disabled:") ? name.substring(9) : name;
}

function useActiveContentInfo(note: FNote | null | undefined) {
    const [ info, setInfo ] = useState<ActiveContentInfo | null>(null);

    function refresh() {
        let type: ActiveContentInfo["type"] | null = null;
        let isEnabled = false;
        let canToggleEnabled = false;

        if (!note) {
            setInfo(null);
            return;
        }

        if (note.type === "render") {
            type = "renderNote";
            isEnabled = note.hasRelation("renderNote");
            canToggleEnabled = note.hasRelation("renderNote") || note.hasRelation("disabled:renderNote");
        } else if (note.type === "webView") {
            type = "webView";
            isEnabled = note.hasLabel("webViewSrc");
            canToggleEnabled = note.hasLabelOrDisabled("webViewSrc");
        } else if (note.type === "code" && note.mime === "application/javascript;env=backend") {
            type = "backendScript";
            for (const backendLabel of [ "run", "customRequestHandler", "customResourceProvider" ]) {
                isEnabled ||= note.hasLabel(backendLabel);

                if (!canToggleEnabled && note.hasLabelOrDisabled(backendLabel)) {
                    canToggleEnabled = true;
                }
            }
        } else if (note.type === "code" && note.mime === "application/javascript;env=frontend") {
            type = "frontendScript";
            isEnabled = note.hasLabel("widget") || note.hasLabel("run");
            canToggleEnabled = note.hasLabelOrDisabled("widget") || note.hasLabelOrDisabled("run");
        } else if (note.type === "code" && note.hasLabelOrDisabled("appTheme")) {
            isEnabled = note.hasLabel("appTheme");
            canToggleEnabled = true;
        }

        for (const labelToCheck of activeContentLabels) {
            if (note.hasLabel(labelToCheck)) {
                type = labelToCheck;
                break;
            } else if (note.hasLabel(`disabled:${labelToCheck}`)) {
                type = labelToCheck;
                isEnabled = false;
                break;
            }
        }

        if (type) {
            setInfo({ type, isEnabled, canToggleEnabled });
        } else {
            setInfo(null);
        }
    }

    // Refresh on note change.
    useEffect(refresh, [ note ]);

    useTriliumEvent("entitiesReloaded", ({ loadResults }) => {
        if (loadResults.getAttributeRows().some(attr => attributes.isAffecting(attr, note))) {
            refresh();
        }
    });

    return info;
}
