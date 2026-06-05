import "./SettingsNavigation.css";

import clsx from "clsx";

import NoteContext from "../../../../components/note_context";
import { useChildNotes } from "../../../react/hooks";

interface SettingsNavigationProps {
    /** Note ID of the settings page currently being displayed (e.g. `_optionsAppearance`). */
    activeNoteId: string;
    /** The context the selector lives in, used to switch pages in place (e.g. inside the quick-edit popup). */
    noteContext: NoteContext | undefined;
}

/**
 * In-content selector for the settings pages, rendered alongside the active options page.
 *
 * It mirrors the list of pages otherwise reached through the note tree, reading them straight from
 * the `_options` subtree so titles, icons and ordering stay in sync. Clicking an entry switches the
 * page within the current context — including the quick-edit popup, which has no note tree — while
 * keeping the popup open. Modified clicks (ctrl/middle/shift) fall through to the global link handler
 * so the page can still be opened in a new tab or window.
 */
export default function SettingsNavigation({ activeNoteId, noteContext }: SettingsNavigationProps) {
    const pages = useChildNotes("_options");

    return (
        <nav className="settings-navigation">
            {pages.map((page) => {
                const isActive = page.noteId === activeNoteId;
                const notePath = `root/_hidden/_options/${page.noteId}`;
                return (
                    <a
                        key={page.noteId}
                        href={`#${notePath}`}
                        className={clsx("settings-navigation-item no-tooltip-preview", { active: isActive })}
                        aria-current={isActive ? "page" : undefined}
                        onClick={(e) => {
                            if (!noteContext || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
                            e.preventDefault();
                            e.stopPropagation();
                            void noteContext.setNote(notePath, { keepActiveDialog: true });
                        }}
                    >
                        <span className={page.getIcon()} />
                        <span className="settings-navigation-title">{page.title}</span>
                    </a>
                );
            })}
        </nav>
    );
}
