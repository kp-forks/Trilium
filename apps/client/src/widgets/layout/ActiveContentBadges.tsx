import { Badge } from "../react/Badge";
import FormToggle from "../react/FormToggle";
import { useNoteContext, useNoteLabelBoolean } from "../react/hooks";

export function ActiveContentBadges() {
    return (
        <>
            <IconPackBadge />
            <ActiveContentToggle />
        </>
    );
}

function IconPackBadge() {
    const { note } = useNoteContext();
    const [ isEnabledIconPack ] = useNoteLabelBoolean(note, "iconPack");
    const [ isDisabledIconPack ] = useNoteLabelBoolean(note, "disabled:iconPack");

    return ((isEnabledIconPack || isDisabledIconPack) &&
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
