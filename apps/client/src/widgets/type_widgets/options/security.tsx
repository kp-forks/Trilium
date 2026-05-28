import { t } from "../../../services/i18n";
import { OptionsRowWithToggle } from "./components/OptionsRow";
import OptionsSection from "./components/OptionsSection";

export default function SecuritySettings() {
    return (
        <>
            <BackendScriptingSettings />
            <SqlConsoleSettings />
        </>
    );
}

function BackendScriptingSettings() {
    // Read-only for now — the actual toggle mechanism (IPC + native
    // dialog on desktop, config.ini on server) will be implemented separately.
    const backendScriptingEnabled = false;

    return (
        <OptionsSection
            title={t("security.backend_scripting_title")}
            description={t("security.backend_scripting_section_description")}
            helpUrl="SPirpZypehBG"
        >
            <OptionsRowWithToggle
                name="backend-scripting-enabled"
                label={t("security.backend_scripting_label")}
                description={t("security.backend_scripting_description")}
                currentValue={backendScriptingEnabled}
                onChange={() => {}}
                disabled={true}
            />
        </OptionsSection>
    );
}

function SqlConsoleSettings() {
    const sqlConsoleEnabled = false;

    return (
        <OptionsSection
            title={t("security.sql_console_title")}
            description={t("security.sql_console_section_description")}
            helpUrl="YKWqdJhzi2VY"
        >
            <OptionsRowWithToggle
                name="sql-console-enabled"
                label={t("security.sql_console_label")}
                description={t("security.sql_console_description")}
                currentValue={sqlConsoleEnabled}
                onChange={() => {}}
                disabled={true}
            />
        </OptionsSection>
    );
}
