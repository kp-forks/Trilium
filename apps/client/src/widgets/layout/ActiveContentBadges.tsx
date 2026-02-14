import { BUILTIN_ATTRIBUTES } from "@triliumnext/commons";
import { useEffect, useState } from "preact/hooks";

import FNote from "../../entities/fnote";
import attributes from "../../services/attributes";
import { t } from "../../services/i18n";
import { Badge } from "../react/Badge";
import FormToggle from "../react/FormToggle";
import { useNoteContext, useTriliumEvent } from "../react/hooks";

const DANGEROUS_ATTRIBUTES = BUILTIN_ATTRIBUTES.filter(a => a.isDangerous);
const activeContentLabels = [ "iconPack" ] as const;

const typeIconMappings: Record<ActiveContentInfo["type"], string> = {
    iconPack: "bx bx-package",
    backendScript: "bx bx-server"
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

function ActiveContentBadge({ info }: { note: FNote, info: ActiveContentInfo }) {
    return (
        <Badge
            className="icon-pack-badge"
            icon={typeIconMappings[info.type]}
            text={getTranslationForType(info.type)}
        />
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
    type: "iconPack" | "backendScript";
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
