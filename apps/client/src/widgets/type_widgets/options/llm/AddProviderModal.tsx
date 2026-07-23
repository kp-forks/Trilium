import "./AddProviderModal.css";

import type { LlmModelInfo } from "@triliumnext/commons";
import { createPortal } from "preact/compat";
import { useMemo, useRef, useState } from "preact/hooks";

import { t } from "../../../../services/i18n";
import { Badge } from "../../../react/Badge";
import { Card, CardSection } from "../../../react/Card";
import FormGroup from "../../../react/FormGroup";
import FormTextBox from "../../../react/FormTextBox";
import Modal from "../../../react/Modal";
import SelectableCard, { SelectableCardGrid } from "../../../react/SelectableCard";
import anthropicIcon from "./icons/anthropic.svg?url";
import claudeAgentIcon from "./icons/claude-ai.svg?url";
import geminiIcon from "./icons/gemini.svg?url";
import ollamaIcon from "./icons/ollama.svg?url";
import openaiIcon from "./icons/openai.svg?url";
import ModelSelection from "./ModelSelection";

export interface LlmProviderConfig {
    id: string;
    name: string;
    provider: string;
    apiKey: string;
    baseURL?: string;
    /** Models the user selected for this provider, with full metadata for offline rendering. */
    selectedModels?: LlmModelInfo[];
}

export interface ProviderType {
    id: string;
    name: string;
    defaultBaseUrl: string;
    /** URL of the provider's logo (an imported `*.svg?url`), rendered monochrome via a CSS mask. */
    iconUrl: string;
    /** Short blurb shown under the provider name on its selectable card. */
    description: string;
    /** Marks the provider as beta, shown as a badge next to its name. */
    beta?: boolean;
    /** When false, the provider needs no API key or base URL (e.g. subscription-based auth). */
    usesApiKey?: boolean;
    /** When true (with usesApiKey: false), the base URL is the primary connection detail (e.g. Ollama). */
    usesBaseUrl?: boolean;
}

// The two Claude-powered providers lead the list so they sit together on the top row,
// making the subscription-vs-API-key choice easy to spot.
export const PROVIDER_TYPES: ProviderType[] = [
    { id: "anthropic", name: "Anthropic", defaultBaseUrl: "https://api.anthropic.com/v1", iconUrl: anthropicIcon, description: t("llm.provider_desc_anthropic") },
    // Uses the Claude Agent SDK on the server; auth belongs to Claude Code (`claude /login`).
    { id: "claude-agent", name: "Claude Code", defaultBaseUrl: "", iconUrl: claudeAgentIcon, description: t("llm.provider_desc_claude_agent"), beta: true, usesApiKey: false },
    { id: "openai", name: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1", iconUrl: openaiIcon, description: t("llm.provider_desc_openai") },
    { id: "google", name: "Google Gemini", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta", iconUrl: geminiIcon, description: t("llm.provider_desc_google") },
    // Local models via Ollama — no API key, only the instance URL.
    { id: "ollama", name: "Ollama", defaultBaseUrl: "http://localhost:11434", iconUrl: ollamaIcon, description: t("llm.provider_desc_ollama"), usesApiKey: false, usesBaseUrl: true }
];

function isValidBaseUrl(value: string): boolean {
    if (!value) {
        return true;
    }
    try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}

interface AddProviderModalProps {
    show: boolean;
    onHidden: () => void;
    onSave: (provider: LlmProviderConfig) => void;
    /** When provided, the modal edits this provider in place instead of adding a new one. */
    existingProvider?: LlmProviderConfig;
    /** Step to open on. Pass 2 to jump straight to model selection (e.g. editing from the chat picker). */
    initialStep?: 1 | 2;
}

export default function AddProviderModal({ show, onHidden, onSave, existingProvider, initialStep = 1 }: AddProviderModalProps) {
    const isEdit = !!existingProvider;
    // Connection details first, then model selection. Editing keeps the same two steps.
    const [step, setStep] = useState<1 | 2>(initialStep);
    const [selectedProvider, setSelectedProvider] = useState(existingProvider?.provider ?? PROVIDER_TYPES[0].id);
    const [apiKey, setApiKey] = useState(existingProvider?.apiKey ?? "");
    const [baseUrl, setBaseUrl] = useState(existingProvider?.baseURL ?? "");
    const [selectedModels, setSelectedModels] = useState<LlmModelInfo[]>(existingProvider?.selectedModels ?? []);
    const formRef = useRef<HTMLFormElement>(null);

    const providerType = useMemo(
        () => PROVIDER_TYPES.find(p => p.id === selectedProvider),
        [selectedProvider]
    );
    const usesApiKey = providerType?.usesApiKey !== false;
    // Providers with an API key can override the base URL as an advanced option;
    // key-less providers (Ollama) can declare it as their primary connection detail.
    const usesBaseUrl = usesApiKey || providerType?.usesBaseUrl === true;
    const trimmedApiKey = apiKey.trim();
    const trimmedBaseUrl = baseUrl.trim();
    const baseUrlIsValid = isValidBaseUrl(trimmedBaseUrl);
    const connectionValid = (usesApiKey ? !!trimmedApiKey : true) && (usesBaseUrl ? baseUrlIsValid : true);

    const modelQuery = useMemo(
        () => ({ provider: selectedProvider, apiKey: trimmedApiKey, baseURL: trimmedBaseUrl || undefined }),
        [selectedProvider, trimmedApiKey, trimmedBaseUrl]
    );

    // Seed the recommended models only when the provider has no stored selection
    // yet: a brand-new provider, or a pre-selection config being migrated (where
    // seeding is the whole point of the "configure models" prompt). An existing
    // but explicitly emptied selection (`[]`, truthy) is a deliberate "hide all"
    // and must not be silently re-populated when the editor is reopened — hence
    // the check against `undefined` rather than edit mode or `length === 0`.
    const seedDefaultModels = !existingProvider?.selectedModels;

    function reset() {
        setStep(initialStep);
        setSelectedProvider(existingProvider?.provider ?? PROVIDER_TYPES[0].id);
        setApiKey(existingProvider?.apiKey ?? "");
        setBaseUrl(existingProvider?.baseURL ?? "");
        setSelectedModels(existingProvider?.selectedModels ?? []);
    }

    function handleCancel() {
        reset();
        onHidden();
    }

    function handleSubmit() {
        if (step === 1) {
            if (connectionValid) {
                setStep(2);
            }
            return;
        }

        const saved: LlmProviderConfig = {
            id: existingProvider?.id ?? `${selectedProvider}_${Date.now()}`,
            name: providerType?.name || selectedProvider,
            provider: selectedProvider,
            apiKey: usesApiKey ? trimmedApiKey : "",
            ...(usesBaseUrl && trimmedBaseUrl && { baseURL: trimmedBaseUrl }),
            selectedModels
        };

        onSave(saved);
        reset();
        onHidden();
    }

    const title = isEdit
        ? t("llm.edit_provider_title", { name: existingProvider?.name ?? providerType?.name ?? selectedProvider })
        : t("llm.add_provider_title");
    const primaryLabel = step === 1
        ? t("llm.next")
        : isEdit ? t("llm.save") : t("llm.add_provider");
    // Step 2 never disables Save: an empty selection is valid (hides all of the
    // provider's models, same as a pre-selection migration), and it avoids a
    // dead-end when the live model fetch fails.
    const primaryDisabled = step === 1 && !connectionValid;

    return createPortal(
        <Modal
            show={show}
            onHidden={handleCancel}
            onSubmit={handleSubmit}
            formRef={formRef}
            title={title}
            className="add-provider-modal"
            size="md"
            maxWidth={600}
            stackable
            footer={
                <>
                    <button type="button" className="btn btn-secondary" onClick={step === 2 ? () => setStep(1) : handleCancel}>
                        {step === 2 ? t("llm.back") : t("llm.cancel")}
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={primaryDisabled}>
                        {primaryLabel}
                    </button>
                </>
            }
        >
            {step === 1 ? (
                <>
                    {!isEdit && (
                        <Card heading={t("llm.provider_type")}>
                            <CardSection>
                                <SelectableCardGrid columns={2}>
                                    {PROVIDER_TYPES.map((provider) => (
                                        <SelectableCard
                                            key={provider.id}
                                            iconUrl={provider.iconUrl}
                                            title={provider.beta
                                                ? <span className="add-provider-card-heading">{provider.name}<Badge text={t("llm.beta")} className="add-provider-beta-badge" outline /></span>
                                                : provider.name}
                                            description={provider.description}
                                            selected={selectedProvider === provider.id}
                                            onSelect={() => setSelectedProvider(provider.id)}
                                        />
                                    ))}
                                </SelectableCardGrid>
                            </CardSection>
                        </Card>
                    )}

                    <Card heading={t("llm.connection_details")}>
                        <CardSection>
                            {usesApiKey ? (
                                <FormGroup name="api-key" label={t("llm.api_key")}>
                                    <FormTextBox
                                        type="password"
                                        currentValue={apiKey}
                                        onChange={setApiKey}
                                        placeholder={t("llm.api_key_placeholder")}
                                        autoFocus
                                    />
                                </FormGroup>
                            ) : usesBaseUrl ? (
                                // Key-less self-hosted provider (Ollama): the base URL is
                                // the primary connection detail, so it is shown here rather
                                // than tucked away under the advanced options.
                                <FormGroup
                                    name="base-url"
                                    label={t("llm.base_url")}
                                    description={
                                        !baseUrlIsValid
                                            ? <span className="text-danger">{t("llm.base_url_invalid")}</span>
                                            : t("llm.base_url_description")
                                    }
                                >
                                    <FormTextBox
                                        type="text"
                                        currentValue={baseUrl}
                                        onChange={setBaseUrl}
                                        placeholder={providerType?.defaultBaseUrl}
                                        autoFocus
                                    />
                                </FormGroup>
                            ) : (
                                <p>{t("llm.claude_agent_description")}</p>
                            )}
                        </CardSection>
                    </Card>

                    {usesApiKey && (
                        <Card heading={t("llm.advanced_options")}>
                            <CardSection>
                                <FormGroup
                                    name="base-url"
                                    label={t("llm.base_url")}
                                    description={
                                        !baseUrlIsValid
                                            ? <span className="text-danger">{t("llm.base_url_invalid")}</span>
                                            : t("llm.base_url_description")
                                    }
                                >
                                    <FormTextBox
                                        type="text"
                                        currentValue={baseUrl}
                                        onChange={setBaseUrl}
                                        placeholder={providerType?.defaultBaseUrl}
                                    />
                                </FormGroup>
                            </CardSection>
                        </Card>
                    )}
                </>
            ) : (
                <Card heading={t("llm.select_models")}>
                    <CardSection>
                        <ModelSelection
                            query={modelQuery}
                            selected={selectedModels}
                            onChange={setSelectedModels}
                            autoSelectDefaults={seedDefaultModels}
                        />
                    </CardSection>
                </Card>
            )}
        </Modal>,
        document.body
    );
}
