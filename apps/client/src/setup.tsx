import "./setup.css";

import { render } from "preact";

import { initLocale, t } from "./services/i18n";
import Button from "./widgets/react/Button";

async function main() {
    await initLocale();

    const bodyWrapper = document.createElement("div");
    bodyWrapper.classList.add("setup-body-wrapper");
    render(<App />, bodyWrapper);
    document.body.replaceChildren(bodyWrapper);
}

function App() {
    return (
        <>
            <h1>{t("setup.heading")}</h1>

            <div class="setup-options">
                <Button
                    text={t("setup.new-document")}
                />

                <Button
                    text={t("setup.sync-from-server")}
                />
            </div>
        </>
    );
}

main();
