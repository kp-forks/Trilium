import "./import_provider.css";

import type { ComponentChildren } from "preact";
import { useCallback, useState } from "preact/hooks";

import { t } from "../../services/i18n.js";
import { useTriliumEvent } from "../react/hooks.js";
import Modal from "../react/Modal.js";
import { importProviders } from "./import_providers/index.js";

/**
 * Generic "import from a service" dialog. It is provider-agnostic: the top of the dialog shows a picker
 * of registered {@link importProviders} as selectable cards, and the chosen provider's panel renders
 * directly below it, driving its own flow (auth, selection, progress). Add new sources by registering
 * them in `import_providers`.
 */
export default function ImportProviderDialog() {
    const [parentNoteId, setParentNoteId] = useState<string>();
    const [providerId, setProviderId] = useState<string>();
    const [footer, setFooter] = useState<ComponentChildren>(null);
    const [shown, setShown] = useState(false);

    useTriliumEvent("showImportProviderDialog", ({ noteId }) => {
        setParentNoteId(noteId);
        setProviderId(undefined);
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
            title={t("import_provider.title")}
            footer={footer}
            footerAlignment="between"
            onHidden={() => setShown(false)}
            show={shown}
        >
            <div className="import-provider-picker">
                {importProviders.map((p) => (
                    <button
                        type="button"
                        className={`import-provider-card ${p.id === providerId ? "selected" : ""}`}
                        key={p.id}
                        onClick={() => setProviderId(p.id)}
                    >
                        <span className="import-provider-card-icon" style={{ "--provider-icon": `url("${p.iconUrl}")` }} />
                        <span className="import-provider-card-text">
                            <span className="import-provider-card-name">{p.name}</span>
                            <span className="import-provider-card-description">{p.description}</span>
                        </span>
                    </button>
                ))}
            </div>

            <div className="import-provider-panel">
                {provider && parentNoteId
                    ? <provider.Panel key={provider.id} parentNoteId={parentNoteId} closeDialog={closeDialog} setFooter={setFooter} />
                    : <p className="import-provider-hint">{t("import_provider.choose_provider")}</p>}
            </div>
        </Modal>
    );
}
