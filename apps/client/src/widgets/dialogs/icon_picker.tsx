import { useRef, useState } from "preact/hooks";

import { t } from "../../services/i18n";
import { useTriliumEvent } from "../react/hooks";
import { IconPickerModal } from "../react/IconPicker";

export interface IconPickerOpts {
    /** Receives the class of the icon picked, e.g. `bx bx-star`. */
    onSelect(iconClass: string): void;
}

/**
 * The icon picker on a screen of its own, for the callers that have no button to hang it under —
 * the text editor's toolbar, whose buttons belong to CKEditor rather than to this application.
 */
export default function IconPickerDialog() {
    const onSelectRef = useRef<IconPickerOpts["onSelect"]>(null);
    const [ shown, setShown ] = useState(false);

    useTriliumEvent("showIconPickerDialog", ({ onSelect }) => {
        onSelectRef.current = onSelect;
        setShown(true);
    });

    return (
        <IconPickerModal
            title={t("note_icon.insert_icon")}
            show={shown}
            onHidden={() => setShown(false)}
            onSelect={(iconClass) => {
                setShown(false);
                onSelectRef.current?.(iconClass);
            }}
        />
    );
}
