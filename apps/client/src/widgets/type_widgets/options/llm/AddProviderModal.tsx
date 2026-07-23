import "./AddProviderModal.css";

import type { LlmModelInfo } from "@triliumnext/commons";
import { createPortal } from "preact/compat";
import { useMemo, useRef, useState } from "preact/hooks";
import { Trans } from "react-i18next";

import { t } from "../../../../services/i18n";
import { Badge } from "../../../react/Badge";
import { Card, CardSection } from "../../../react/Card";
import FormTextBox from "../../../react/FormTextBox";
import Modal from "../../../react/Modal";
import SelectableCard, { SelectableCardGrid } from "../../../react/SelectableCard";
import OptionsRow from "../components/OptionsRow";
import anthropicIcon from "./icons/anthropic.svg?url";
import claudeAgentIcon from "./icons/claude-ai.svg?url";
import geminiIcon from "./icons/gemini.svg?url";
import lmStudioIcon from "./icons/lmstudio.svg?url";
import ollamaIcon from "./icons/ollama.svg?url";
import openaiIcon from "./icons/openai.svg?url";
import openAiCompatibleIcon from "./icons/robot.svg?url";
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
    iconUrl: string;
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
    /**
     * Which section of the provider list this card belongs to — how it is billed,
     * mirroring the three the user guide describes: metered API keys, a fixed-fee
     * subscription reused from elsewhere, and self-hosted.
     */
    group: ProviderGroupId;
}

/**
 * List sections, in the order they are shown. Keys are spelled out rather than
 * built from the id so they stay greppable for the translation tooling.
 */
const PROVIDER_GROUPS = [
    { id: "cloud", headingKey: "llm.provider_group_cloud", descriptionKey: "llm.provider_group_cloud_description" },
    { id: "subscription", headingKey: "llm.provider_group_subscription", descriptionKey: "llm.provider_group_subscription_description" },
    { id: "local", headingKey: "llm.provider_group_local", descriptionKey: "llm.provider_group_local_description" },
    // Kept apart from the local runtimes: the same card reaches a hosted
    // OpenAI-compatible service (OpenRouter, Groq, …), so neither "no usage cost"
    // nor "stays on your machine" can be claimed for it.
    { id: "custom", headingKey: "llm.provider_group_custom", descriptionKey: "llm.provider_group_custom_description" }
] as const;

type ProviderGroupId = (typeof PROVIDER_GROUPS)[number]["id"];

export const PROVIDER_TYPES: ProviderType[] = [
    { id: "anthropic", name: "Anthropic", group: "cloud", defaultBaseUrl: "https://api.anthropic.com/v1", iconUrl: anthropicIcon, description: t("llm.provider_desc_anthropic") },
    { id: "openai", name: "OpenAI", group: "cloud", defaultBaseUrl: "https://api.openai.com/v1", iconUrl: openaiIcon, description: t("llm.provider_desc_openai") },
    { id: "google", name: "Google Gemini", group: "cloud", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta", iconUrl: geminiIcon, description: t("llm.provider_desc_google") },
    // Uses the Claude Agent SDK on the server; auth belongs to Claude Code (`claude /login`),
    // and usage is covered by the subscription rather than charged per token.
    { id: "claude-agent", name: "Claude Code", group: "subscription", defaultBaseUrl: "", iconUrl: claudeAgentIcon, description: t("llm.provider_desc_claude_agent"), beta: true, apiKey: "none", baseUrl: "none" },
    // The three self-hosted cards share one server-side provider; they differ only in
    // the endpoint they prefill and the setup hint they show.
    {
        id: "ollama", name: "Ollama", group: "local", defaultBaseUrl: "http://localhost:11434", prefillBaseUrl: true,
        iconUrl: ollamaIcon, description: t("llm.provider_desc_ollama"),
        setupHintKey: "llm.setup_hint_ollama", apiKey: "none", baseUrl: "required"
    },
    {
        id: "lmstudio", name: "LM Studio", group: "local", defaultBaseUrl: "http://localhost:1234/v1", prefillBaseUrl: true,
        iconUrl: lmStudioIcon, description: t("llm.provider_desc_lmstudio"),
        setupHintKey: "llm.setup_hint_lmstudio", apiKey: "none", baseUrl: "required"
    },
    {
        id: "openai-compatible", name: t("llm.provider_openai_compatible"), group: "custom", defaultBaseUrl: "http://localhost:8080/v1",
        iconUrl: openAiCompatibleIcon, description: t("llm.provider_desc_openai_compatible"),
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

/**
 * Pick a provider, enter its credentials, choose its models. Named rather than
 * numbered because editing skips the first one — the provider type of a saved
 * config can't change, so its id and name would no longer match.
 */
export type ProviderStep = "provider" | "connection" | "models";

interface AddProviderModalProps {
    show: boolean;
    onHidden: () => void;
    onSave: (provider: LlmProviderConfig) => void;
    /** When provided, the modal edits this provider in place instead of adding a new one. */
    existingProvider?: LlmProviderConfig;
    /** Step to open on. Pass "models" to jump straight to model selection (e.g. editing from the chat picker). */
    initialStep?: ProviderStep;
}

export default function AddProviderModal({ show, onHidden, onSave, existingProvider, initialStep }: AddProviderModalProps) {
    const isEdit = !!existingProvider;
    const firstStep = initialStep ?? (isEdit ? "connection" : "provider");
    const [step, setStep] = useState<ProviderStep>(firstStep);
    const [selectedProvider, setSelectedProvider] = useState(existingProvider?.provider ?? PROVIDER_TYPES[0].id);
    // Whether the user has actually picked a provider. `selectedProvider` always
    // holds one so the connection step has something to work with, but on a fresh
    // add nothing should *look* chosen — clicking a card is the choice, and it
    // moves on immediately, so a pre-highlighted card would be a lie.
    const [providerChosen, setProviderChosen] = useState(firstStep !== "provider");
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

    /**
     * Picking a card swaps in that provider's endpoint — so the right port is
     * filled in by default — and moves straight on, since the choice *is* the
     * action on this step (no separate confirmation click).
     */
    function selectProviderType(providerId: string) {
        setSelectedProvider(providerId);
        setProviderChosen(true);
        setBaseUrl(prefilledBaseUrl(providerId));
        setStep("connection");
    }

    // Under the endpoint field: the validation error if any, otherwise the
    // provider's own setup reminder (how to start its server), falling back to
    // the generic explanation of what the field overrides.
    const baseUrlDescription = !baseUrlIsValid
        ? <span className="text-danger">{t("llm.base_url_invalid")}</span>
        : providerType?.setupHintKey
            ? <Trans i18nKey={providerType.setupHintKey} components={{ Code: <code /> }} />
            : t("llm.base_url_description");

    // Rendered in one of two slots: ahead of the key for self-hosted providers
    // (the endpoint is their primary connection detail) or after it for vendor
    // ones, where it is only an override — hence the focus following the same rule.
    const baseUrlField = (
        <OptionsRow name="base-url" label={t("llm.base_url")} description={baseUrlDescription} stacked>
            <FormTextBox
                type="text"
                currentValue={baseUrl}
                onChange={setBaseUrl}
                placeholder={providerType?.defaultBaseUrl}
                autoFocus={baseUrlMode === "required"}
            />
        </OptionsRow>
    );

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
        setStep(firstStep);
        setSelectedProvider(initialProvider);
        setProviderChosen(firstStep !== "provider");
        setApiKey(existingProvider?.apiKey ?? "");
        setBaseUrl(existingProvider?.baseURL ?? prefilledBaseUrl(initialProvider));
        setSelectedModels(existingProvider?.selectedModels ?? []);
    }

    function handleCancel() {
        reset();
        onHidden();
    }

    function handleSubmit() {
        if (step === "provider") {
            // Enter with nothing picked yet must not silently advance with whichever
            // provider happens to be first in the list.
            if (providerChosen) {
                setStep("connection");
            }
            return;
        }
        if (step === "connection") {
            if (connectionValid) {
                setStep("models");
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

    // Past the picker the cards are gone, so the title carries which provider is
    // being set up.
    const title = isEdit
        ? t("llm.edit_provider_title", { name: existingProvider?.name ?? providerType?.name ?? selectedProvider })
        : step === "provider"
            ? t("llm.add_provider_title")
            : t("llm.add_provider_title_named", { name: providerType?.name ?? selectedProvider });
    const primaryLabel = step === "models"
        ? (isEdit ? t("llm.save") : t("llm.add_provider"))
        : t("llm.next");
    // The models step never disables Save: an empty selection is valid (hides all
    // of the provider's models, same as a pre-selection migration), and it avoids
    // a dead-end when the live model fetch fails.
    const primaryDisabled = step === "connection" && !connectionValid;
    // Back retraces the steps this modal actually opened with: editing starts at
    // the connection details (the provider type of a saved config is fixed), so
    // there is nothing behind it to go back to.
    const previousStep = step === "models" ? "connection" : step === "connection" ? "provider" : undefined;
    const canGoBack = previousStep !== undefined && !(previousStep === "provider" && firstStep !== "provider");

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
            // The provider list is the tallest step and grows with every provider
            // added, so scroll the body rather than pushing the footer off-screen.
            scrollable
            footer={
                <>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={canGoBack && previousStep ? () => setStep(previousStep) : handleCancel}
                    >
                        {canGoBack ? t("llm.back") : t("llm.cancel")}
                    </button>
                    {/* Choosing a card advances on its own, so the provider step needs no primary action. */}
                    {step !== "provider" && (
                        <button type="submit" className="btn btn-primary" disabled={primaryDisabled}>
                            {primaryLabel}
                        </button>
                    )}
                </>
            }
        >
            {step === "provider" ? (
                // One card per group rather than one "Provider" card holding them all:
                // the groups are the step's structure, so each gets the heading and the
                // enclosure, and the choices below it are only the ones it describes.
                PROVIDER_GROUPS.map(group => (
                    <ProviderGroup
                        key={group.id}
                        heading={t(group.headingKey)}
                        description={t(group.descriptionKey)}
                        providers={PROVIDER_TYPES.filter(p => p.group === group.id)}
                        selectedProvider={providerChosen ? selectedProvider : undefined}
                        onSelect={selectProviderType}
                    />
                ))
            ) : step === "connection" ? (
                // A single unlabelled card of settings rows: the step holds a handful of
                // fields for one provider — already named in the modal title — so the
                // hairline between rows is all the structure it needs.
                <Card>
                    <CardSection>
                        {/* Self-hosted providers lead with the endpoint — the port is the
                            detail that has to be right — and treat the key as optional. */}
                        {baseUrlMode === "required" && baseUrlField}
                        {usesApiKey && (
                            <OptionsRow
                                name="api-key"
                                label={t("llm.api_key")}
                                description={apiKeyMode === "optional" ? t("llm.api_key_optional_description") : undefined}
                                stacked
                            >
                                <FormTextBox
                                    type="password"
                                    currentValue={apiKey}
                                    onChange={setApiKey}
                                    placeholder={t("llm.api_key_placeholder")}
                                    autoFocus={baseUrlMode !== "required"}
                                />
                            </OptionsRow>
                        )}
                        {baseUrlMode === "advanced" && baseUrlField}
                        {!usesApiKey && baseUrlMode === "none" && (
                            <p>{t("llm.claude_agent_description")}</p>
                        )}
                    </CardSection>
                </Card>
            ) : (
                <Card heading={t("llm.select_models")}>
                    <CardSection>
                        <ModelSelection
                            query={modelQuery}
                            selected={selectedModels}
                            onChange={setSelectedModels}
                            autoSelectDefaults={seedDefaultModels}
                            // Only for the local runtimes: the checklist is about starting a
                            // server on your own machine, which says nothing useful about a
                            // hosted endpoint failing to list.
                            troubleshooting={providerType?.group === "local" ? <SelfHostedTroubleshooting /> : undefined}
                        />
                    </CardSection>
                </Card>
            )}
        </Modal>,
        document.body
    );
}

/**
 * One group of the provider list, as its own card. The blurb sits inside the card
 * above the choices, the way the settings pages place a section description, so it
 * reads as an introduction to the rows it qualifies rather than as a caption
 * floating between two boxes.
 *
 * Laid out one provider per row so each description fits on a single line — the
 * list is the whole step, so it can afford the width, and it stays identical on
 * mobile where a grid would collapse to one column anyway.
 */
function ProviderGroup({ heading, description, providers, selectedProvider, onSelect }: {
    heading: string;
    /** Where the user's notes end up with this group — the axis the list is grouped on. */
    description: string;
    providers: ProviderType[];
    /** The chosen provider, or undefined while nothing has been picked yet. */
    selectedProvider: string | undefined;
    onSelect: (providerId: string) => void;
}) {
    return (
        <Card heading={heading} className="add-provider-group">
            <CardSection>
                <p className="add-provider-group-description">{description}</p>
                <SelectableCardGrid columns={1}>
                    {providers.map((provider) => (
                        <SelectableCard
                            key={provider.id}
                            iconUrl={provider.iconUrl}
                            title={provider.beta
                                ? <span className="add-provider-card-heading">{provider.name}<Badge text={t("llm.beta")} className="add-provider-beta-badge" outline /></span>
                                : provider.name}
                            description={provider.description}
                            selected={selectedProvider === provider.id}
                            onSelect={() => onSelect(provider.id)}
                        />
                    ))}
                </SelectableCardGrid>
            </CardSection>
        </Card>
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
