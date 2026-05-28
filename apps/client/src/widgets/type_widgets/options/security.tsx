import { useState } from "preact/hooks";

import { t } from "../../../services/i18n";
import toast from "../../../services/toast";
import { isElectron, restartDesktopApp } from "../../../services/utils";
import Button from "../../react/Button";
import Collapsible from "../../react/Collapsible";
import { useTriliumOptionBool } from "../../react/hooks";
import OptionsRow, { OptionsRowWithToggle } from "./components/OptionsRow";
import OptionsSection from "./components/OptionsSection";

export default function SecuritySettings() {
    const [pendingRestart, setPendingRestart] = useState(false);

    return (
        <>
            <BackendScriptingSettings pendingRestart={pendingRestart} setPendingRestart={setPendingRestart} />
            <SqlConsoleSettings pendingRestart={pendingRestart} setPendingRestart={setPendingRestart} />
            {pendingRestart && isElectron() && (
                <OptionsSection noCard>
                    <OptionsRow name="restart" centered>
                        <Button
                            name="restart-app-button"
                            text={t("security.restart_now")}
                            icon="bx bx-refresh"
                            size="micro"
                            onClick={restartDesktopApp}
                        />
                    </OptionsRow>
                </OptionsSection>
            )}
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
            <pre><code>{`[Security]\n${configKey}=true`}</code></pre>
            <p>{t("security.server_env_hint")}</p>
            <pre><code>{envVar}=true</code></pre>
        </Collapsible>
    );
}

interface ToggleSectionProps {
    pendingRestart: boolean;
    setPendingRestart: (value: boolean) => void;
}

function BackendScriptingSettings({ pendingRestart, setPendingRestart }: ToggleSectionProps) {
    const [backendScriptingEnabled] = useTriliumOptionBool("backendScriptingEnabled");
    const isDesktop = isElectron();

    async function handleToggle(enabled: boolean) {
        const confirmed = await window.electronApi!.security.setBackendScriptingEnabled(enabled);
        if (confirmed) {
            setPendingRestart(true);
            toast.showMessage(t("security.restart_required"));
        }
    }

    return (
        <OptionsSection
            title={t("security.backend_scripting_title")}
            description={t("security.backend_scripting_section_description")}
            helpUrl="SPirpZypehBG"
        >
            <OptionsRowWithToggle
                name="backend-scripting-enabled"
                label={t("security.backend_scripting_label")}
                description={pendingRestart
                    ? t("security.restart_required")
                    : t("security.backend_scripting_description")}
                currentValue={pendingRestart ? !backendScriptingEnabled : backendScriptingEnabled}
                onChange={handleToggle}
                disabled={!isDesktop || pendingRestart}
            />
            <ServerConfigHint
                configKey="backendScriptingEnabled"
                envVar="TRILIUM_SECURITY_BACKEND_SCRIPTING_ENABLED"
            />
        </OptionsSection>
    );
}

function SqlConsoleSettings({ pendingRestart, setPendingRestart }: ToggleSectionProps) {
    const [sqlConsoleEnabled] = useTriliumOptionBool("sqlConsoleEnabled");
    const isDesktop = isElectron();

    async function handleToggle(enabled: boolean) {
        const confirmed = await window.electronApi!.security.setSqlConsoleEnabled(enabled);
        if (confirmed) {
            setPendingRestart(true);
            toast.showMessage(t("security.restart_required"));
        }
    }

    return (
        <OptionsSection
            title={t("security.sql_console_title")}
            description={t("security.sql_console_section_description")}
            helpUrl="YKWqdJhzi2VY"
        >
            <OptionsRowWithToggle
                name="sql-console-enabled"
                label={t("security.sql_console_label")}
                description={pendingRestart
                    ? t("security.restart_required")
                    : t("security.sql_console_description")}
                currentValue={pendingRestart ? !sqlConsoleEnabled : sqlConsoleEnabled}
                onChange={handleToggle}
                disabled={!isDesktop || pendingRestart}
            />
            <ServerConfigHint
                configKey="sqlConsoleEnabled"
                envVar="TRILIUM_SECURITY_SQL_CONSOLE_ENABLED"
            />
        </OptionsSection>
    );
}
