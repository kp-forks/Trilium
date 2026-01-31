import "./TabSwitcher.css";

import { createPortal } from "preact/compat";
import { useEffect, useState } from "preact/hooks";

import appContext from "../../components/app_context";
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

    useTriliumEvent("contextsReopened", () => {
        console.log("Reopened contexts");
    });

    return (
        <div className="tabs">
            {mainNoteContexts.map((tabContext) => (
                <span key={tabContext.ntxId}>{tabContext.note?.title}</span>
            ))}
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
