import "./SettingsNavigation.css";

import clsx from "clsx";

import { useChildNotes } from "../../../react/hooks";

interface SettingsNavigationProps {
    /** Note ID of the settings page currently being displayed (e.g. `_optionsAppearance`). */
    activeNoteId: string;
}

/**
 * In-content selector for the settings pages, rendered alongside the active options page.
 *
 * It mirrors the list of pages otherwise reached through the (hoisted) note tree, reading them
 * straight from the `_options` subtree so titles, icons and ordering stay in sync. Navigation
 * reuses the global link handler (`goToLink`) through plain note-path anchors, so clicking an
 * entry switches the page within the current tab and keeps the tree/hoisting in step.
 */
export default function SettingsNavigation({ activeNoteId }: SettingsNavigationProps) {
    const pages = useChildNotes("_options");

    return (
        <nav className="settings-navigation">
            {pages.map((page) => {
                const isActive = page.noteId === activeNoteId;
                return (
                    <a
                        key={page.noteId}
                        href={`#root/_hidden/_options/${page.noteId}`}
                        className={clsx("settings-navigation-item no-tooltip-preview", { active: isActive })}
                        aria-current={isActive ? "page" : undefined}
                    >
                        <span className={page.getIcon()} />
                        <span className="settings-navigation-title">{page.title}</span>
                    </a>
                );
            })}
        </nav>
    );
}
