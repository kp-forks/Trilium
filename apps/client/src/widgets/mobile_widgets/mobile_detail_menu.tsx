import { t } from "../../services/i18n";
import { getHelpUrlForNote } from "../../services/in_app_help";
import { openInAppHelpFromUrl } from "../../services/utils";
import { FormDropdownDivider, FormListItem } from "../react/FormList";
import { useNoteContext } from "../react/hooks";
import { CommandItem, NoteContextMenu } from "../ribbon/NoteActions";

export default function MobileDetailMenu() {
    const { note, noteContext } = useNoteContext();
    const helpUrl = getHelpUrlForNote(note);

    return (
        <div style={{ contain: "none" }}>
            {note && (
                <NoteContextMenu
                    note={note} noteContext={noteContext}
                    extraItems={<>
                        <CommandItem command="insertChildNote" icon="bx bx-plus" disabled={note.type === "search"} text={t("mobile_detail_menu.insert_child_note")} />
                        <FormDropdownDivider />
                        {helpUrl && <FormListItem
                            icon="bx bx-help-circle"
                            onClick={() => openInAppHelpFromUrl(helpUrl)}
                        >{t("help-button.title")}</FormListItem>}
                        <FormDropdownDivider />
                    </>}
                />
            )}
        </div>
    );
}
