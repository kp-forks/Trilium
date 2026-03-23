import { render } from "preact";

import { initLocale, t } from "./services/i18n";

async function main() {
    await initLocale();

    const bodyWrapper = document.createElement("div");
    render(<App />, bodyWrapper);
    document.body.replaceChildren(bodyWrapper);
}

function App() {
    return (
        <h1>{t("setup.heading")}</h1>
    );
}

main();
