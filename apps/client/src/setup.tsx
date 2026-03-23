import "./setup.css";

import { render } from "preact";
import { useState } from "preact/hooks";

import { initLocale, t } from "./services/i18n";
import Button from "./widgets/react/Button";
import { CardFrame } from "./widgets/react/Card";
import Icon from "./widgets/react/Icon";

async function main() {
    await initLocale();

    const bodyWrapper = document.createElement("div");
    document.body.classList.add("setup");
    render(<App />, bodyWrapper);
    document.body.replaceChildren(bodyWrapper);
}

type State = "firstOptions" | "syncFromDesktop" | "syncFromServer";

function App() {
    const [ state, setState ] = useState<State>("syncFromServer");

    return (
        <div class="setup-container">
            {state === "firstOptions" && <SetupOptions setState={setState} />}
            {state === "syncFromServer" && <SyncFromServer setState={setState} />}
        </div>
    );
}

function SetupOptions({ setState }: { setState: (state: State) => void }) {
    return (
        <div class="page setup-options-container">
            <h1>{t("setup.heading")}</h1>

            <div class="setup-options">
                <SetupOptionCard
                    icon="bx bx-file-blank"
                    title={t("setup.new-document")}
                    description={t("setup.new-document-description")}
                />

                <SetupOptionCard
                    icon="bx bx-server"
                    title={t("setup.sync-from-server")}
                    description={t("setup.sync-from-server-description")}
                    onClick={() => setState("syncFromServer")}
                />

                <SetupOptionCard
                    icon="bx bx-desktop"
                    title={t("setup.sync-from-desktop")}
                    description={t("setup.sync-from-desktop-description")}
                    onClick={() => setState("syncFromDesktop")}
                />
            </div>
        </div>
    );
}

function SyncFromServer({ setState }: { setState: (state: State) => void }) {
    return (
        <div class="page sync-from-server">
            <h1>{t("setup.sync-from-server-page-title")}</h1>
            <p>{t("setup.sync-from-server-page-description")}</p>

            <main />

            <footer>
                <Button text={t("setup.button-back")} onClick={() => setState("firstOptions")} kind="lowProfile" />
                <Button text={t("setup.button-finish-setup")} kind="primary" />
            </footer>
        </div>
    );
}

function SetupOptionCard({ title, description, icon, onClick }: { title: string; description: string, icon: string, onClick?: () => void }) {
    return (
        <CardFrame className="setup-option-card" onClick={onClick}>
            <Icon icon={icon} />

            <div>
                <h3>{title}</h3>
                <p>{description}</p>
            </div>
        </CardFrame>
    );
}

main();
