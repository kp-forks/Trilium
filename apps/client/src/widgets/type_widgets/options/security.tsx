import { t } from "../../../services/i18n";
import Admonition from "../../react/Admonition";
import { OptionsRowWithToggle } from "./components/OptionsRow";
import OptionsSection from "./components/OptionsSection";

export default function SecuritySettings() {
    return (
        <>
            <ScriptingSettings />
        </>
    );
}

function ScriptingSettings() {
    // These are read-only for now — the actual toggle mechanism (IPC + native
    // dialog on desktop, config.ini on server) will be implemented separately.
    // For now we display the current state from the server config.
    const backendScriptingEnabled = false;
    const sqlConsoleEnabled = false;

    return (
        <OptionsSection title={t("security.scripting_title")}>
            <Admonition type="warning">
                {t("security.scripting_warning")}
            </Admonition>

            <OptionsRowWithToggle
                name="backend-scripting-enabled"
                label={t("security.backend_scripting_label")}
                description={t("security.backend_scripting_description")}
                currentValue={backendScriptingEnabled}
                onChange={() => {}}
                disabled={true}
            />

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
