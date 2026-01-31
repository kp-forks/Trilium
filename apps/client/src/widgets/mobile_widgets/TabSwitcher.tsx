import "./TabSwitcher.css";

import clsx from "clsx";
import { createPortal } from "preact/compat";
import { useEffect, useState } from "preact/hooks";

import appContext from "../../components/app_context";
import NoteContext from "../../components/note_context";
import { NoteContent } from "../collections/legacy/ListOrGridView";
import { LaunchBarActionButton } from "../launch_bar/launch_bar_widgets";
import { useTriliumEvent } from "../react/hooks";
import Modal from "../react/Modal";

export default function TabSwitcher() {
    const [ shown, setShown ] = useState(true);

    return (
        <>
            <LaunchBarActionButton
                icon="bx bx-rectangle"
                text="Tabs"
                onClick={() => setShown(true)}
            />
            {createPortal(<TabBarModal shown={shown} setShown={setShown} />, document.body)}
        </>
    );
}

function TabBarModal({ shown, setShown }: {
    shown: boolean;
    setShown: (newValue: boolean) => void;
}) {
    return (
        <Modal
            className="tab-bar-modal"
            size="xl"
            title="Tabs"
            show={shown}
            onHidden={() => setShown(false)}
        >
            <TabBarModelContent />
        </Modal>
    );
}

function TabBarModelContent() {
    const mainNoteContexts = useMainNoteContexts();

    return (
        <div className="tabs">
            {mainNoteContexts.map((noteContext) => (
                <Tab key={noteContext.ntxId} noteContext={noteContext} />
            ))}
        </div>
    );
}

function Tab({ noteContext }: {
    noteContext: NoteContext;
}) {
    const { note } = noteContext;

    return (
        <div class="tab-card">
            <header>{noteContext.note?.title}</header>
            <div className={clsx("tab-preview", `type-${note?.type ?? "empty"}`)}>
                {note && <NoteContent
                    note={note}
                    highlightedTokens={undefined}
                    trim
                    includeArchivedNotes={false}
                />}
            </div>
        </div>
    );
}

function useMainNoteContexts() {
    const [ noteContexts, setNoteContexts ] = useState(appContext.tabManager.getMainNoteContexts());

    useTriliumEvent("newNoteContextCreated", ({ noteContext }) => {
        if (noteContext.mainNtxId) return;
        setNoteContexts([
            ...noteContexts,
            noteContext
        ]);
    });

    return noteContexts;
}
