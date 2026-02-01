import { t } from "../../services/i18n";
import { getHelpUrlForNote } from "../../services/in_app_help";
import { openInAppHelpFromUrl } from "../../services/utils";
import { FormDropdownDivider, FormListItem } from "../react/FormList";
import { useNoteContext } from "../react/hooks";
import { CommandItem, NoteContextMenu } from "../ribbon/NoteActions";

export default function MobileDetailMenu() {
    const { note, noteContext, parentComponent, ntxId } = useNoteContext();
    const helpUrl = getHelpUrlForNote(note);
    const subContexts = noteContext?.getMainContext().getSubContexts() ?? [];
    const isMainContext = noteContext?.isMainContext();

    return (
        <div style={{ contain: "none" }}>
            {note && (
                <NoteContextMenu
                    note={note} noteContext={noteContext}
                    extraItems={<>
                        <CommandItem command="insertChildNote" icon="bx bx-plus" disabled={note.type === "search"} text={t("mobile_detail_menu.insert_child_note")} />
                        {helpUrl && <>
                            <FormDropdownDivider />
                            <FormListItem
                                icon="bx bx-help-circle"
                                onClick={() => openInAppHelpFromUrl(helpUrl)}
                            >{t("help-button.title")}</FormListItem>
                        </>}
                        {subContexts.length < 2 && <>
                            <FormDropdownDivider />
                            <FormListItem
                                onClick={() => parentComponent.triggerCommand("openNewNoteSplit", { ntxId })}
                                icon="bx bx-dock-right"
                            >{t("create_pane_button.create_new_split")}</FormListItem>
                        </>}
                        {!isMainContext && <>
                            <FormDropdownDivider />
                            <FormListItem
                                icon="bx bx-x"
                                onClick={() => {
                                    // Wait first for the context menu to be dismissed, otherwise the backdrop stays on.
                                    requestAnimationFrame(() => {
                                        parentComponent.triggerCommand("closeThisNoteSplit", { ntxId });
                                    });
                                }}
                            >{t("close_pane_button.close_this_pane")}</FormListItem>
                        </>}
                        <FormDropdownDivider />
                    </>}
                />
            )}
        </div>
    );
}
