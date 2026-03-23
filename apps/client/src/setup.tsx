import "./setup.css";

import { render } from "preact";

import { initLocale, t } from "./services/i18n";
import { CardFrame } from "./widgets/react/Card";
import Icon from "./widgets/react/Icon";

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
                <SetupOptionCard
                    icon="bx bx-file-blank"
                    title={t("setup.new-document")}
                    description={t("setup.new-document-description")}
                />

                <SetupOptionCard
                    icon="bx bx-server"
                    title={t("setup.sync-from-server")}
                    description={t("setup.sync-from-server-description")}
                />

                <SetupOptionCard
                    icon="bx bx-desktop"
                    title={t("setup.sync-from-desktop")}
                    description={t("setup.sync-from-desktop-description")}
                />
            </div>
        </div>
    );
}

function SetupOptionCard({ title, description, icon }: { title: string; description: string, icon: string }) {
    return (
        <CardFrame className="setup-option-card">
            <Icon icon={icon} />

            <main>
                <h3>{title}</h3>
                <p>{description}</p>
            </main>
        </CardFrame>
    );
}

main();
