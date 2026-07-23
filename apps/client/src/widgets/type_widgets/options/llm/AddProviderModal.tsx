import "./AddProviderModal.css";

import type { LlmModelInfo } from "@triliumnext/commons";
import { createPortal } from "preact/compat";
import { useMemo, useRef, useState } from "preact/hooks";
import { Trans } from "react-i18next";

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
    /** Shown as the endpoint field's placeholder, and prefilled into it when {@link prefillBaseUrl} is set. */
    defaultBaseUrl: string;
    /**
     * Write {@link defaultBaseUrl} into the field when the card is picked. Set for
     * self-hosted providers, where the port is the one detail the user must get
     * right and differs per runtime; vendor providers keep it as a hint only, so
     * that an unedited field stores no endpoint override.
     */
    prefillBaseUrl?: boolean;
    /** URL of the provider's logo (an imported `*.svg?url`), rendered monochrome via a CSS mask. */
    iconUrl?: string;
    /** Boxicons class shown when the provider has no logo of its own. */
    icon?: string;
    /** Short blurb shown under the provider name on its selectable card. */
    description: string;
    /** One-line setup reminder shown under the endpoint field (i18n key, rendered via `<Trans>`). */
    setupHintKey?: string;
    /** Marks the provider as beta, shown as a badge next to its name. */
    beta?: boolean;
    /**
     * How the provider authenticates: a key it requires (vendor APIs), one it may
     * take (self-hosted endpoints that sit behind a proxy or gateway), or none at
     * all (subscription auth). Defaults to `"required"`.
     */
    apiKey?: "required" | "optional" | "none";
    /**
     * Where the endpoint URL belongs: the primary connection detail (self-hosted),
     * an advanced override (vendor APIs), or not applicable. Defaults to `"advanced"`.
     */
    baseUrl?: "required" | "advanced" | "none";
}

// The two Claude-powered providers lead the list so they sit together on the top row,
// making the subscription-vs-API-key choice easy to spot; the self-hosted ones close it.
export const PROVIDER_TYPES: ProviderType[] = [
    { id: "anthropic", name: "Anthropic", defaultBaseUrl: "https://api.anthropic.com/v1", iconUrl: anthropicIcon, description: t("llm.provider_desc_anthropic") },
    // Uses the Claude Agent SDK on the server; auth belongs to Claude Code (`claude /login`).
    { id: "claude-agent", name: "Claude Code", defaultBaseUrl: "", iconUrl: claudeAgentIcon, description: t("llm.provider_desc_claude_agent"), beta: true, apiKey: "none", baseUrl: "none" },
    { id: "openai", name: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1", iconUrl: openaiIcon, description: t("llm.provider_desc_openai") },
    { id: "google", name: "Google Gemini", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta", iconUrl: geminiIcon, description: t("llm.provider_desc_google") },
    // The three self-hosted cards share one server-side provider; they differ only in
    // the endpoint they prefill and the setup hint they show.
    {
        id: "ollama", name: "Ollama", defaultBaseUrl: "http://localhost:11434", prefillBaseUrl: true,
        iconUrl: ollamaIcon, description: t("llm.provider_desc_ollama"),
        setupHintKey: "llm.setup_hint_ollama", apiKey: "none", baseUrl: "required"
    },
    {
        id: "lmstudio", name: "LM Studio", defaultBaseUrl: "http://localhost:1234/v1", prefillBaseUrl: true,
        icon: "bx bx-desktop", description: t("llm.provider_desc_lmstudio"),
        setupHintKey: "llm.setup_hint_lmstudio", apiKey: "none", baseUrl: "required"
    },
    {
        id: "openai-compatible", name: t("llm.provider_openai_compatible"), defaultBaseUrl: "http://localhost:8080/v1",
        icon: "bx bx-server", description: t("llm.provider_desc_openai_compatible"),
        setupHintKey: "llm.setup_hint_openai_compatible", apiKey: "optional", baseUrl: "required"
    }
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
    const [baseUrl, setBaseUrl] = useState(existingProvider?.baseURL ?? prefilledBaseUrl(existingProvider?.provider ?? PROVIDER_TYPES[0].id));
    const [selectedModels, setSelectedModels] = useState<LlmModelInfo[]>(existingProvider?.selectedModels ?? []);
    const formRef = useRef<HTMLFormElement>(null);

    const providerType = useMemo(
        () => PROVIDER_TYPES.find(p => p.id === selectedProvider),
        [selectedProvider]
    );
    const apiKeyMode = providerType?.apiKey ?? "required";
    // Self-hosted providers show the endpoint as their primary connection detail;
    // vendor providers keep it tucked away as an advanced override.
    const baseUrlMode = providerType?.baseUrl ?? "advanced";
    const usesApiKey = apiKeyMode !== "none";
    const trimmedApiKey = apiKey.trim();
    const trimmedBaseUrl = baseUrl.trim();
    const baseUrlIsValid = isValidBaseUrl(trimmedBaseUrl);
    const connectionValid = (apiKeyMode !== "required" || !!trimmedApiKey)
        && (baseUrlMode === "none" || (baseUrlIsValid && (baseUrlMode !== "required" || !!trimmedBaseUrl)));

    /** Picking a card swaps in that provider's endpoint, so the right port is filled in by default. */
    function selectProviderType(providerId: string) {
        setSelectedProvider(providerId);
        setBaseUrl(prefilledBaseUrl(providerId));
    }

    // Under the endpoint field: the validation error if any, otherwise the
    // provider's own setup reminder (how to start its server), falling back to
    // the generic explanation of what the field overrides.
    const baseUrlDescription = !baseUrlIsValid
        ? <span className="text-danger">{t("llm.base_url_invalid")}</span>
        : providerType?.setupHintKey
            ? <Trans i18nKey={providerType.setupHintKey} components={{ Code: <code /> }} />
            : t("llm.base_url_description");

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
        const initialProvider = existingProvider?.provider ?? PROVIDER_TYPES[0].id;
        setStep(initialStep);
        setSelectedProvider(initialProvider);
        setApiKey(existingProvider?.apiKey ?? "");
        setBaseUrl(existingProvider?.baseURL ?? prefilledBaseUrl(initialProvider));
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
            ...(baseUrlMode !== "none" && trimmedBaseUrl && { baseURL: trimmedBaseUrl }),
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
                                            onSelect={() => selectProviderType(provider.id)}
                                        />
                                    ))}
                                </SelectableCardGrid>
                            </CardSection>
                        </Card>
                    )}

                    <Card heading={t("llm.connection_details")}>
                        <CardSection>
                            {/* Self-hosted providers lead with the endpoint — the port is the
                                detail that has to be right — and treat the key as optional. */}
                            {baseUrlMode === "required" && (
                                <FormGroup name="base-url" label={t("llm.base_url")} description={baseUrlDescription}>
                                    <FormTextBox
                                        type="text"
                                        currentValue={baseUrl}
                                        onChange={setBaseUrl}
                                        placeholder={providerType?.defaultBaseUrl}
                                        autoFocus
                                    />
                                </FormGroup>
                            )}
                            {usesApiKey && (
                                <FormGroup
                                    name="api-key"
                                    label={t("llm.api_key")}
                                    description={apiKeyMode === "optional" ? t("llm.api_key_optional_description") : undefined}
                                >
                                    <FormTextBox
                                        type="password"
                                        currentValue={apiKey}
                                        onChange={setApiKey}
                                        placeholder={t("llm.api_key_placeholder")}
                                        autoFocus={baseUrlMode !== "required"}
                                    />
                                </FormGroup>
                            )}
                            {!usesApiKey && baseUrlMode === "none" && (
                                <p>{t("llm.claude_agent_description")}</p>
                            )}
                        </CardSection>
                    </Card>

                    {baseUrlMode === "advanced" && (
                        <Card heading={t("llm.advanced_options")}>
                            <CardSection>
                                <FormGroup name="base-url" label={t("llm.base_url")} description={baseUrlDescription}>
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
                            troubleshooting={providerType?.baseUrl === "required" ? <SelfHostedTroubleshooting /> : undefined}
                        />
                    </CardSection>
                </Card>
            )}
        </Modal>,
        document.body
    );
}

/**
 * The endpoint a freshly picked provider starts with. Only self-hosted providers
 * prefill: their port is the one thing the user must get right and it differs per
 * runtime, whereas a vendor endpoint is a hint the user should leave alone (an
 * unedited field must not store a redundant override).
 */
export function prefilledBaseUrl(providerId: string): string {
    const providerType = PROVIDER_TYPES.find(p => p.id === providerId);
    return providerType?.prefillBaseUrl ? providerType.defaultBaseUrl : "";
}

/**
 * Shown when a self-hosted endpoint can't be listed — the point at which the
 * user needs setup instructions, rather than on the way in.
 */
function SelfHostedTroubleshooting() {
    return (
        <ul className="model-selection-troubleshooting">
            <li>{t("llm.troubleshoot_server_running")}</li>
            <li>{t("llm.troubleshoot_port")}</li>
            <li>{t("llm.troubleshoot_remote")}</li>
        </ul>
    );
}
