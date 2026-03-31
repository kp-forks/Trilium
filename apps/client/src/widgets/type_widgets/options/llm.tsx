import { useCallback, useMemo, useState } from "preact/hooks";
import { t } from "../../../services/i18n";
import Button from "../../react/Button";
import OptionsSection from "./components/OptionsSection";
import AddProviderModal, { type LlmProviderConfig, PROVIDER_TYPES } from "./llm/AddProviderModal";
import ActionButton from "../../react/ActionButton";
import dialog from "../../../services/dialog";
import { useTriliumOption } from "../../react/hooks";

export default function LlmSettings() {
    const [providersJson, setProvidersJson] = useTriliumOption("llmProviders");
    const providers = useMemo<LlmProviderConfig[]>(() => {
        try {
            return providersJson ? JSON.parse(providersJson) : [];
        } catch {
            return [];
        }
    }, [providersJson]);
    const setProviders = useCallback((newProviders: LlmProviderConfig[]) => {
        setProvidersJson(JSON.stringify(newProviders));
    }, [setProvidersJson]);
    const [showAddModal, setShowAddModal] = useState(false);

    const handleAddProvider = useCallback((newProvider: LlmProviderConfig) => {
        setProviders([...providers, newProvider]);
    }, [providers, setProviders]);

    const handleDeleteProvider = useCallback(async (providerId: string, providerName: string) => {
        if (!(await dialog.confirm(t("llm.delete_provider_confirmation", { name: providerName })))) {
            return;
        }
        setProviders(providers.filter(p => p.id !== providerId));
    }, [providers, setProviders]);

    return (
        <OptionsSection title={t("llm.settings_title")}>
            <p>{t("llm.settings_description")}</p>

            <Button
                size="small"
                icon="bx bx-plus"
                text={t("llm.add_provider")}
                onClick={() => setShowAddModal(true)}
            />

            <hr />

            <h5>{t("llm.configured_providers")}</h5>
            <ProviderList
                providers={providers}
                onDelete={handleDeleteProvider}
            />

            <AddProviderModal
                show={showAddModal}
                onHidden={() => setShowAddModal(false)}
                onSave={handleAddProvider}
            />
        </OptionsSection>
    );
}

interface ProviderListProps {
    providers: LlmProviderConfig[];
    onDelete: (providerId: string, providerName: string) => Promise<void>;
}

function ProviderList({ providers, onDelete }: ProviderListProps) {
    if (!providers.length) {
        return <div>{t("llm.no_providers_configured")}</div>;
    }

    return (
        <div style={{ overflow: "auto" }}>
            <table className="table table-stripped">
                <thead>
                    <tr>
                        <th>{t("llm.provider_name")}</th>
                        <th>{t("llm.provider_type")}</th>
                        <th>{t("llm.actions")}</th>
                    </tr>
                </thead>
                <tbody>
                    {providers.map((provider) => {
                        const providerType = PROVIDER_TYPES.find(p => p.id === provider.provider);
                        return (
                            <tr key={provider.id}>
                                <td>{provider.name}</td>
                                <td>{providerType?.name || provider.provider}</td>
                                <td>
                                    <ActionButton
                                        icon="bx bx-trash"
                                        text={t("llm.delete_provider")}
                                        onClick={() => onDelete(provider.id, provider.name)}
                                    />
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
