import "./OptionsDialog.css";

import { useCallback, useContext, useEffect, useRef, useState } from "preact/hooks";

import appContext from "../../components/app_context";
import NoteContext from "../../components/note_context";
import { t } from "../../services/i18n";
import utils from "../../services/utils";
import NoteDetail from "../NoteDetail";
import ActionButton from "../react/ActionButton";
import FormList, { FormListItem } from "../react/FormList";
import { useChildNotes, useContainedLinkNavigation, useNoteContext, useTriliumEvent } from "../react/hooks";
import Modal from "../react/Modal";
import { NoteContextContext, ParentComponent } from "../react/react_utils";
import SettingsNavigation from "../type_widgets/options/components/SettingsNavigation";

/** The settings page shown when no specific section was requested and none was viewed yet this session. */
const DEFAULT_SECTION = "_optionsAppearance";

/**
 * The settings dialog, opened via the `showOptions` command. Settings open in a dialog rather than
 * a hoisted tab (which confused users by seemingly hiding the note tree): the full-height sidebar
 * lists the settings pages while the body renders the active one through a dedicated note context.
 *
 * On mobile the sidebar and the page become a master-detail flow instead: the dialog first shows
 * only the list of pages, tapping one reveals it full-screen with a back button in the header.
 */
export default function OptionsDialog() {
    const [ shown, setShown ] = useState(false);
    const parentComponent = useContext(ParentComponent);
    const [ noteContext, setNoteContext ] = useState(() => new NoteContext("_options-dialog"));
    // Remembers the page last viewed this session so reopening the dialog lands there instead of
    // always on Appearance. Kept in component state (resets on reload), not persisted.
    const [ lastSection, setLastSection ] = useState<string | null>(null);
    // Which half of the mobile master-detail flow is visible; has no effect on desktop.
    const [ mobileView, setMobileView ] = useState<"list" | "page">("list");
    // Direction of the in-flight slide between the two mobile views, or null when at rest. While
    // set, both panes stay rendered so the outgoing one can slide away as the incoming one slides
    // in; cleared when the slide animation finishes.
    const [ mobileTransition, setMobileTransition ] = useState<"to-list" | "to-page" | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const isMobile = utils.isMobile();

    // Switches between the mobile master/detail views with a slide. The initial view on open is
    // set directly (without animating) by the showOptions handler instead.
    const switchMobileView = useCallback((view: "list" | "page") => {
        if (view === mobileView) return;
        setMobileView(view);
        // With animations globally disabled there is no animationend to clear the transition,
        // so switch directly.
        if (!document.body.classList.contains("motion-disabled")) {
            setMobileTransition(view === "page" ? "to-page" : "to-list");
        }
    }, [ mobileView ]);

    useTriliumEvent("showOptions", async ({ section }) => {
        const noteContext = new NoteContext("_options-dialog");
        await noteContext.setNote(section ?? lastSection ?? DEFAULT_SECTION, { keepActiveDialog: true });

        // Events triggered at note context level (e.g. the save indicator) would not work since the note context has no parent component. Propagate events to parent component so that they can be handled properly.
        noteContext.triggerEvent = (name, data) => parentComponent?.handleEventInChildren(name, data);
        setNoteContext(noteContext);
        // Requesting a specific section (e.g. "set up a password") skips the mobile master list.
        setMobileView(section ? "page" : "list");
        setMobileTransition(null);
        setShown(true);
    });

    // Bootstrap adds its own classes (e.g. `show`) to the modal element at runtime, so the
    // className prop must stay static — rewriting it from a render would wipe them and visually
    // dismiss the dialog. Toggle the mobile view classes directly on the element instead.
    useEffect(() => {
        modalRef.current?.classList.toggle("mobile-view-list", mobileView === "list");
        modalRef.current?.classList.toggle("mobile-view-page", mobileView === "page");
        modalRef.current?.classList.toggle("mobile-transition-to-list", mobileTransition === "to-list");
        modalRef.current?.classList.toggle("mobile-transition-to-page", mobileTransition === "to-page");
    }, [ mobileView, mobileTransition ]);

    // End the view transition once the slide finishes (animationend bubbles up from the panes).
    useEffect(() => {
        const modalElement = modalRef.current;
        if (!modalElement) return;
        function onAnimationEnd(e: AnimationEvent) {
            if (e.animationName.startsWith("options-slide")) {
                setMobileTransition(null);
            }
        }
        modalElement.addEventListener("animationend", onAnimationEnd);
        return () => modalElement.removeEventListener("animationend", onAnimationEnd);
    }, []);

    // Keep navigation between settings pages (sidebar entries, "Related settings" links) inside the
    // dialog; links to regular notes open in the quick-edit popup instead.
    useContainedLinkNavigation(modalRef, useCallback((notePath, viewScope) => {
        if (notePath.split("/").at(-1)?.startsWith("_options")) {
            void noteContext.setNote(notePath, { viewScope, keepActiveDialog: true });
            switchMobileView("page");
        } else {
            void appContext.triggerCommand("openInPopup", { noteIdOrPath: notePath });
        }
    }, [ noteContext, switchMobileView ]));

    return (
        <NoteContextContext.Provider value={noteContext}>
            <Modal
                modalRef={modalRef}
                title={t("options.title")}
                header={isMobile && (mobileView === "page" ? <MobilePageHeader onBack={() => switchMobileView("list")} /> : <MobilePageHeader />)}
                sidebar={isMobile ? undefined : <SettingsSidebar />}
                isFullPageOnMobile
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
                {isMobile && (
                    <div className="options-mobile-nav">
                        <MobileSettingsList onSelect={(noteId) => {
                            void noteContext.setNote(noteId, { keepActiveDialog: true });
                            switchMobileView("page");
                        }} />
                    </div>
                )}
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

/**
 * The settings page list shown as the master view of the mobile master-detail flow, using the
 * standard list component rather than the desktop sidebar's compact selector.
 */
function MobileSettingsList({ onSelect }: { onSelect: (noteId: string) => void }) {
    const pages = useChildNotes("_options");
    const { noteId: activeNoteId } = useNoteContext();
    return (
        <FormList onSelect={onSelect}>
            {pages.map((page) => (
                <FormListItem
                    key={page.noteId}
                    icon={page.getIcon()}
                    value={page.noteId}
                    active={page.noteId === activeNoteId}
                >
                    {page.title}
                </FormListItem>
            ))}
        </FormList>
    );
}

/**
 * Replaces the static "Options" title on mobile. In the page view it shows a back button returning
 * to the master list followed by the title of the page in view; in the list view a decorative
 * settings icon takes the button's place (keeping the same footprint so the title doesn't shift
 * between views) followed by the dialog title.
 */
function MobilePageHeader({ onBack }: { onBack?: () => void }) {
    const { note } = useNoteContext();
    return (
        <div className="options-mobile-page-header">
            {onBack ? (
                <ActionButton
                    icon="bx bx-chevron-left"
                    text={t("options.back")}
                    onClick={onBack}
                />
            ) : (
                <span className="options-header-icon icon-action bx bx-cog" aria-hidden="true" />
            )}
            <h5 className="options-mobile-page-title">{onBack ? note?.title : t("options.title")}</h5>
        </div>
    );
}
