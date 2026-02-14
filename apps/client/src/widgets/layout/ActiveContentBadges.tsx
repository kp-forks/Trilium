import { BUILTIN_ATTRIBUTES } from "@triliumnext/commons";
import { note } from "mermaid/dist/rendering-util/rendering-elements/shapes/note.js";
import { useEffect, useState } from "preact/hooks";

import FNote from "../../entities/fnote";
import attributes from "../../services/attributes";
import { t } from "../../services/i18n";
import { openInAppHelpFromUrl } from "../../services/utils";
import { BadgeWithDropdown } from "../react/Badge";
import { FormDropdownDivider, FormDropdownSubmenu, FormListItem } from "../react/FormList";
import FormToggle from "../react/FormToggle";
import { useNoteContext, useNoteLabel, useTriliumEvent, useTriliumOption } from "../react/hooks";

const DANGEROUS_ATTRIBUTES = BUILTIN_ATTRIBUTES.filter(a => a.isDangerous);
const activeContentLabels = [ "iconPack" ] as const;

const typeMappings: Record<ActiveContentInfo["type"], {
    icon: string;
    helpPage: string;
    apiDocsPage?: string;
    isExecutable?: boolean
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
    },
    frontendScript: {
        icon: "bx bx-window",
        helpPage: "yIhgI5H7A2Sm",
        apiDocsPage: "Q2z6av6JZVWm",
        isExecutable: true
    }
};

export function ActiveContentBadges() {
    const { note } = useNoteContext();
    const info = useActiveContentInfo(note);

    return (note && info &&
        <>
            <ActiveContentBadge info={info} note={note} />
            <ActiveContentToggle info={info} note={note} />
        </>
    );
}

function ActiveContentBadge({ info, note }: { note: FNote, info: ActiveContentInfo }) {
    const { icon, helpPage, apiDocsPage, isExecutable } = typeMappings[info.type];
    return (
        <BadgeWithDropdown
            className="icon-pack-badge"
            icon={icon}
            text={getTranslationForType(info.type)}
        >
            {isExecutable && (
                <>
                    <FormListItem
                        icon="bx bx-play"
                        triggerCommand="runActiveNote"
                    >{t("active_content_badges.menu_execute_now")}</FormListItem>
                    <ScriptRunOptions note={note} />
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

function ScriptRunOptions({ note }: { note: FNote }) {
    const [ run, setRun ] = useNoteLabel(note, "run");

    const options: {
        title: string;
        value: string | null;
        type: "backendScript" | "frontendScript";
    }[] = [
        {
            title: t("active_content_badges.menu_run_disabled"),
            value: null,
            type: "backendScript"
        },
        {
            title: t("active_content_badges.menu_run_backend_startup"),
            value: "backendStartup",
            type: "backendScript"
        },
        {
            title: t("active_content_badges.menu_run_daily"),
            value: "daily",
            type: "backendScript"
        },
        {
            title: t("active_content_badges.menu_run_hourly"),
            value: "hourly",
            type: "backendScript"
        },
    ];

    return (
        <FormDropdownSubmenu title={t("active_content_badges.menu_run")} icon="bx bx-rss" dropStart>
            {options.map(({ title, value }) => (
                <FormListItem
                    key={value}
                    onClick={() => setRun(value)}
                    checked={run ? run === value : value === null }
                >{title}</FormListItem>
            ))}
        </FormDropdownSubmenu>
    );
}

function getTranslationForType(type: ActiveContentInfo["type"]) {
    switch (type) {
        case "iconPack":
            return t("active_content_badges.type_icon_pack");
        case "backendScript":
            return t("active_content_badges.type_backend_script");
    }
}

function ActiveContentToggle({ note, info }: { note: FNote, info: ActiveContentInfo }) {
    const typeTranslation = getTranslationForType(info.type);

    return info && <FormToggle
        switchOnName="" switchOffName=""
        currentValue={info.isEnabled}
        switchOnTooltip={t("active_content_badges.toggle_tooltip_disable_tooltip", { type: typeTranslation })}
        switchOffTooltip={t("active_content_badges.toggle_tooltip_enable_tooltip", { type: typeTranslation })}
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
                await attributes.addLabel(note.noteId, newName, attr.value);
                await attributes.removeAttributeById(note.noteId, attr.attributeId);
            }
        }}
    />;
}

function getNameWithoutPrefix(name: string) {
    return name.startsWith("disabled:") ? name.substring(9) : name;
}

interface ActiveContentInfo {
    type: "iconPack" | "backendScript" | "frontendScript";
    isEnabled: boolean;
}

function useActiveContentInfo(note: FNote | null | undefined) {
    const [ info, setInfo ] = useState<ActiveContentInfo | null>(null);

    function refresh() {
        let type: ActiveContentInfo["type"] | null = null;
        let isEnabled = true;

        if (!note) {
            setInfo(null);
            return;
        }

        if (note.type === "code" && note.mime === "application/javascript;env=backend") {
            type = "backendScript";
        }

        for (const labelToCheck of activeContentLabels ) {
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
            setInfo({ type, isEnabled });
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
