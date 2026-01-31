import "./TabSwitcher.css";

import { createPortal } from "preact/compat";
import { useState } from "preact/hooks";

import { LaunchBarActionButton } from "../launch_bar/launch_bar_widgets";
import Modal from "../react/Modal";

export default function TabSwitcher() {
    const [ shown, setShown ] = useState(false);

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
            Hi
        </Modal>
    );
}
