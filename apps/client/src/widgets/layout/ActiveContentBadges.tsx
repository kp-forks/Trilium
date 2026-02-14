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

    return (
        <>
            {info?.type === "iconPack" && <IconPackBadge />}
            <ActiveContentToggle />
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

function ActiveContentToggle() {
    return <FormToggle
        switchOnName="Enabled"
        switchOffName="Enabled"
        currentValue={true}
    />;
}

const activeContentLabels = [ "iconPack" ] as const;

interface ActiveContentInfo {
    type: "iconPack";
}

function useActiveContentInfo(note: FNote | null | undefined) {
    const [ info, setInfo ] = useState<ActiveContentInfo | null>(null);

    function refresh() {
        let type: ActiveContentInfo["type"] | null = null;

        if (!note) {
            setInfo(null);
            return;
        }

        for (const labelToCheck of activeContentLabels ) {
            if (note.hasLabel(labelToCheck)) {
                type = labelToCheck;
            }
        }

        if (type) {
            setInfo({ type });
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
