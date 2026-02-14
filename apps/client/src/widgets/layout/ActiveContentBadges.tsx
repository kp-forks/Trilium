import { useEffect, useState } from "preact/hooks";

import FNote from "../../entities/fnote";
import attributes from "../../services/attributes";
import { Badge } from "../react/Badge";
import FormToggle from "../react/FormToggle";
import { useNoteContext, useTriliumEvent } from "../react/hooks";

export function ActiveContentBadges() {
    const { note } = useNoteContext();
    const info = useActiveContentInfo(note);
    console.log("Got inf ", info);

    return (info &&
        <>
            {info.type === "iconPack" && <IconPackBadge />}
            <ActiveContentToggle info={info} />
        </>
    );
}

function IconPackBadge() {
    return (
        <Badge
            className="icon-pack-badge"
            icon="bx bx-package"
            text="Icon pack"
        />
    );
}

function ActiveContentToggle({ info }: { info: ActiveContentInfo }) {
    return info && <FormToggle
        switchOnName="Enabled"
        switchOffName="Enabled"
        currentValue={info.isEnabled}
    />;
}

const activeContentLabels = [ "iconPack" ] as const;

interface ActiveContentInfo {
    type: "iconPack";
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
