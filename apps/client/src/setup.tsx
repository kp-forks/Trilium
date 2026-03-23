import "./setup.css";

import { render } from "preact";

import { initLocale, t } from "./services/i18n";
import { CardFrame } from "./widgets/react/Card";

async function main() {
    await initLocale();

    const bodyWrapper = document.createElement("div");
    document.body.classList.add("setup");
    render(<App />, bodyWrapper);
    document.body.replaceChildren(bodyWrapper);
}

function App() {
    return (
        <div class="setup-container">
            <h1>{t("setup.heading")}</h1>

            <div class="setup-options">
                <CardFrame>
                    <h3>{t("setup.new-document")}</h3>
                    <p>{t("setup.new-document-description")}</p>
                </CardFrame>

                <CardFrame>
                    <h3>{t("setup.sync-from-server")}</h3>
                    <p>{t("setup.sync-from-server-description")}</p>
                </CardFrame>

                <CardFrame>
                    <h3>{t("setup.sync-from-desktop")}</h3>
                    <p>{t("setup.sync-from-desktop-description")}</p>
                </CardFrame>
            </div>
        </div>
    );
}

main();
