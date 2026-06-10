import "./OptionsDialog.css";

import { useCallback, useContext, useRef, useState } from "preact/hooks";

import appContext from "../../components/app_context";
import NoteContext from "../../components/note_context";
import { t } from "../../services/i18n";
import NoteDetail from "../NoteDetail";
import { useContainedLinkNavigation, useNoteContext, useTriliumEvent } from "../react/hooks";
import Modal from "../react/Modal";
import { NoteContextContext, ParentComponent } from "../react/react_utils";
import SettingsNavigation from "../type_widgets/options/components/SettingsNavigation";

/** The settings page shown when no specific section was requested and none was viewed yet this session. */
const DEFAULT_SECTION = "_optionsAppearance";

/**
 * The settings dialog, opened via the `showOptions` command. Settings open in a dialog rather than
 * a hoisted tab (which confused users by seemingly hiding the note tree): the full-height sidebar
 * lists the settings pages while the body renders the active one through a dedicated note context.
 */
export default function OptionsDialog() {
    const [ shown, setShown ] = useState(false);
    const parentComponent = useContext(ParentComponent);
    const [ noteContext, setNoteContext ] = useState(() => new NoteContext("_options-dialog"));
    // Remembers the page last viewed this session so reopening the dialog lands there instead of
    // always on Appearance. Kept in component state (resets on reload), not persisted.
    const [ lastSection, setLastSection ] = useState<string | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    useTriliumEvent("showOptions", async ({ section }) => {
        const noteContext = new NoteContext("_options-dialog");
        await noteContext.setNote(section ?? lastSection ?? DEFAULT_SECTION, { keepActiveDialog: true });

        // Events triggered at note context level (e.g. the save indicator) would not work since the note context has no parent component. Propagate events to parent component so that they can be handled properly.
        noteContext.triggerEvent = (name, data) => parentComponent?.handleEventInChildren(name, data);
        setNoteContext(noteContext);
        setShown(true);
    });

    // Keep navigation between settings pages (sidebar entries, "Related settings" links) inside the
    // dialog; links to regular notes open in the quick-edit popup instead.
    useContainedLinkNavigation(modalRef, useCallback((notePath, viewScope) => {
        if (notePath.split("/").at(-1)?.startsWith("_options")) {
            void noteContext.setNote(notePath, { viewScope, keepActiveDialog: true });
        } else {
            appContext.triggerCommand("openInPopup", { noteIdOrPath: notePath });
        }
    }, [ noteContext ]));

    return (
        <NoteContextContext.Provider value={noteContext}>
            <Modal
                modalRef={modalRef}
                title={t("options.title")}
                sidebar={<SettingsSidebar />}
                customTitleBarButtons={[{
                    iconClassName: "bx-expand-alt",
                    title: t("popup-editor.maximize"),
                    onClick: async () => {
                        if (!noteContext.noteId) return;
                        const { noteId, hoistedNoteId } = noteContext;
                        await appContext.tabManager.openInNewTab(noteId, hoistedNoteId, true);
                        setShown(false);
                    }
                }]}
                className="options-dialog"
                size="lg"
                show={shown}
                onHidden={() => {
                    // Remember the settings page in view so the next open lands on it.
                    if (noteContext.noteId) {
                        setLastSection(noteContext.noteId);
                    }
                    setShown(false);
                }}
            >
                <NoteDetail />
            </Modal>
        </NoteContextContext.Provider>
    );
}

/**
 * The settings page selector shown in the dialog's sidebar. It derives the active page from
 * `useNoteContext()` (resolved against the dialog's own context via the surrounding provider) so the
 * highlighted entry tracks navigation. The link clicks themselves are handled by the dialog's
 * {@link useContainedLinkNavigation} interceptor.
 */
function SettingsSidebar() {
    const { noteId } = useNoteContext();
    if (!noteId) return null;
    return <SettingsNavigation activeNoteId={noteId} />;
}
