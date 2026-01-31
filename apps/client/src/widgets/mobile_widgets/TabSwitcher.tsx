import "./TabSwitcher.css";

import clsx from "clsx";
import { createPortal } from "preact/compat";
import { useCallback, useState } from "preact/hooks";

import appContext from "../../components/app_context";
import NoteContext from "../../components/note_context";
import { t } from "../../services/i18n";
import { NoteContent } from "../collections/legacy/ListOrGridView";
import { LaunchBarActionButton } from "../launch_bar/launch_bar_widgets";
import { useActiveNoteContext, useTriliumEvent } from "../react/hooks";
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
    const selectTab = useCallback((noteContextToActivate: NoteContext) => {
        appContext.tabManager.activateNoteContext(noteContextToActivate.ntxId);
        setShown(false);
    }, [ setShown ]);

    return (
        <Modal
            className="tab-bar-modal"
            size="xl"
            title="Tabs"
            show={shown}
            onHidden={() => setShown(false)}
        >
            <TabBarModelContent selectTab={selectTab} />
        </Modal>
    );
}

function TabBarModelContent({ selectTab }: {
    selectTab: (noteContextToActivate: NoteContext) => void;
}) {
    const mainNoteContexts = useMainNoteContexts();
    const activeNoteContext = useActiveNoteContext();

    return (
        <div className="tabs">
            {mainNoteContexts.map((noteContext) => (
                <Tab
                    key={noteContext.ntxId}
                    noteContext={noteContext}
                    activeNtxId={activeNoteContext.ntxId}
                    selectTab={selectTab}
                />
            ))}
        </div>
    );
}

function Tab({ noteContext, selectTab, activeNtxId }: {
    noteContext: NoteContext;
    selectTab: (noteContextToActivate: NoteContext) => void;
    activeNtxId: string | null | undefined;
}) {
    const { note } = noteContext;

    return (
        <div
            class={clsx("tab-card", {
                active: noteContext.ntxId === activeNtxId
            })}
            onClick={() => selectTab(noteContext)}
        >
            <header>
                <span className="title">{noteContext.note?.title ?? t("tab_row.new_tab")}</span>
            </header>
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
