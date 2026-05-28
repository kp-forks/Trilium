import { t } from "../../../services/i18n";
import { isElectron } from "../../../services/utils";
import Collapsible from "../../react/Collapsible";
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

function ServerConfigHint({ configKey, envVar }: { configKey: string; envVar: string }) {
    if (isElectron()) {
        return null;
    }

    return (
        <Collapsible title={t("security.how_to_enable")}>
            <p>{t("security.server_config_hint")}</p>
            <pre><code>{`[Scripting]\n${configKey}=true`}</code></pre>
            <p>{t("security.server_env_hint")}</p>
            <pre><code>{envVar}=true</code></pre>
        </Collapsible>
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
            <ServerConfigHint
                configKey="backendScriptingEnabled"
                envVar="TRILIUM_SCRIPTING_BACKEND_ENABLED"
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
            <ServerConfigHint
                configKey="sqlConsoleEnabled"
                envVar="TRILIUM_SCRIPTING_SQLCONSOLEENABLED"
            />
        </OptionsSection>
    );
}
