import { t } from "../../services/i18n";
import { FormDropdownDivider } from "../react/FormList";
import { useNoteContext } from "../react/hooks";
import { CommandItem, NoteContextMenu } from "../ribbon/NoteActions";

export default function MobileDetailMenu() {
    const { note, noteContext } = useNoteContext();

    return (
        <div style={{ contain: "none" }}>
            {note && (
                <NoteContextMenu
                    note={note} noteContext={noteContext}
                    extraItems={<>
                        <CommandItem command="insertChildNote" icon="bx bx-plus" disabled={note.type === "search"} text={t("mobile_detail_menu.insert_child_note")} />
                        <FormDropdownDivider />
                    </>}
                />
            )}
        </div>
    );
}
