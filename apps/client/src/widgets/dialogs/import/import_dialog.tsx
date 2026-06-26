import "./import_dialog.css";

import type { ComponentChildren } from "preact";
import { useCallback, useState } from "preact/hooks";

import { t } from "../../../services/i18n.js";
import { useTriliumEvent } from "../../react/hooks.js";
import Modal from "../../react/Modal.js";
import { importProviders } from "./index.js";
import type { ImportProvider } from "./types.js";

/**
 * Unified import dialog. The top shows a picker of registered {@link importProviders} as selectable
 * cards: external services in a grid, with local file import grouped full-width beneath them and
 * selected by default. The chosen provider's panel renders below, driving its own flow (file
 * selection, auth, progress). Add new sources by registering them in `index.ts`.
 */
export default function ImportDialog() {
    const [parentNoteId, setParentNoteId] = useState<string>();
    const [providerId, setProviderId] = useState<string>();
    const [footer, setFooter] = useState<ComponentChildren>(null);
    const [shown, setShown] = useState(false);

    useTriliumEvent("showImportDialog", ({ noteId }) => {
        setParentNoteId(noteId);
        setProviderId(defaultProviderId);
        setFooter(null);
        setShown(true);
    });

    const provider = importProviders.find((p) => p.id === providerId);

    // Stable so the chosen provider's panel can safely memoize on it (an inline arrow would change every
    // render, defeating the panel's useCallback/useEffect dependencies).
    const closeDialog = useCallback(() => setShown(false), []);

    return (
        <Modal
            className="import-provider-dialog"
            size="lg"
            scrollable
            title={t("import.importIntoNote")}
            footer={footer}
            footerAlignment="between"
            onHidden={() => setShown(false)}
            show={shown}
        >
            <div className="import-provider-picker">
                {serviceProviders.map((p) => (
                    <ImportProviderCard key={p.id} provider={p} selected={p.id === providerId} onSelect={() => setProviderId(p.id)} />
                ))}
            </div>

            {localProviders.length > 0 && (
                <div className="import-provider-local">
                    {localProviders.map((p) => (
                        <ImportProviderCard key={p.id} provider={p} selected={p.id === providerId} onSelect={() => setProviderId(p.id)} />
                    ))}
                </div>
            )}

            <div className="import-provider-panel">
                {provider && parentNoteId
                    ? <provider.Panel key={provider.id} parentNoteId={parentNoteId} closeDialog={closeDialog} setFooter={setFooter} />
                    : <p className="import-provider-hint">{t("import_provider.choose_provider")}</p>}
            </div>
        </Modal>
    );
}

// Services fill the card grid; local file import is grouped full-width beneath them and is the default
// selection (the dialog's primary path). Computed once — the registry is static.
const serviceProviders = importProviders.filter((p) => p.group !== "local");
const localProviders = importProviders.filter((p) => p.group === "local");
const defaultProviderId = (localProviders[0] ?? importProviders[0])?.id;

function ImportProviderCard({ provider, selected, onSelect }: { provider: ImportProvider; selected: boolean; onSelect: () => void }) {
    return (
        <button type="button" className={`import-provider-card ${selected ? "selected" : ""}`} onClick={onSelect}>
            {provider.iconUrl
                ? <span className="import-provider-card-icon" style={{ "--provider-icon": `url("${provider.iconUrl}")` }} />
                : <span className={`import-provider-card-bxicon ${provider.icon ?? ""}`} />}
            <span className="import-provider-card-text">
                <span className="import-provider-card-name">{provider.name}</span>
                <span className="import-provider-card-description">{provider.description}</span>
            </span>
        </button>
    );
}
