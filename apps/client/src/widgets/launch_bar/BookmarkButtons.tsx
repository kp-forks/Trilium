import "./BookmarkButtons.css";

import { CSSProperties } from "preact";
import { useContext, useMemo } from "preact/hooks";

import type FNote from "../../entities/fnote";
import froca from "../../services/froca";
import { t } from "../../services/i18n";
import { useChildNotes, useNoteLabelBoolean } from "../react/hooks";
import NoteLink from "../react/NoteLink";
import ResponsiveContainer from "../react/ResponseContainer";
import { CustomNoteLauncher } from "./GenericButtons";
import { LaunchBarContext, LaunchBarDropdownButton, useLauncherIconAndTitle } from "./launch_bar_widgets";

const PARENT_NOTE_ID = "_lbBookmarks";

export default function BookmarkButtons() {
    const { isHorizontalLayout } = useContext(LaunchBarContext);
    const style = useMemo<CSSProperties>(() => ({
        display: "flex",
        flexDirection: isHorizontalLayout ? "row" : "column",
        contain: "none"
    }), [ isHorizontalLayout ]);
    const childNotes = useChildNotes(PARENT_NOTE_ID);

    return (
        <ResponsiveContainer
            desktop={
                <div style={style}>
                    {childNotes?.map(childNote => <SingleBookmark key={childNote.noteId} note={childNote} />)}
                </div>
            }
            mobile={
                <LaunchBarDropdownButton
                    icon="bx bx-bookmark"
                    title={t("bookmark_buttons.bookmarks")}
                >
                    <div className="bookmark-folder-widget">
                        <ul className="children-notes">
                            {childNotes?.map(childNote => <SingleBookmark key={childNote.noteId} note={childNote} />)}
                        </ul>
                    </div>
                </LaunchBarDropdownButton>
            }
        />
    );
}

function SingleBookmark({ note }: { note: FNote }) {
    const [ bookmarkFolder ] = useNoteLabelBoolean(note, "bookmarkFolder");
    return <ResponsiveContainer
        desktop={
            bookmarkFolder
                ? <BookmarkFolder note={note} />
                : <CustomNoteLauncher launcherNote={note} getTargetNoteId={() => note.noteId} />
        }
        mobile={
            <li key={note.noteId}>
                <NoteLink notePath={note.noteId} noPreview showNoteIcon containerClassName="note-link" noTnLink />
            </li>
        }
    />;
}

function BookmarkFolder({ note }: { note: FNote }) {
    const { icon, title } = useLauncherIconAndTitle(note);
    const childNotes = useChildNotes(note.noteId);

    return (
        <LaunchBarDropdownButton
            icon={icon}
            title={title}
        >
            <div className="bookmark-folder-widget">
                <div className="parent-note">
                    <NoteLink notePath={note.noteId} noPreview showNoteIcon containerClassName="note-link" noTnLink />
                </div>

                <ul className="children-notes">
                    {childNotes.map(childNote => (
                        <li key={childNote.noteId}>
                            <NoteLink notePath={childNote.noteId} noPreview showNoteIcon containerClassName="note-link" noTnLink />
                        </li>
                    ))}
                </ul>
            </div>
        </LaunchBarDropdownButton>
    );
}
