import "./import_provider.css";

import type { ComponentChildren } from "preact";
import { useCallback, useState } from "preact/hooks";

import { t } from "../../services/i18n.js";
import Button from "../react/Button.js";
import { useTriliumEvent } from "../react/hooks.js";
import Modal from "../react/Modal.js";
import { importProviders } from "./import_providers/index.js";

/**
 * Generic "import from a service" dialog. It is provider-agnostic: it shows a picker of registered
 * {@link importProviders} and then hands off to the chosen provider's panel, which drives its own
 * flow (auth, selection, progress). Add new sources by registering them in `import_providers`.
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
            title={provider ? provider.name : t("import_provider.title")}
            header={provider && <Button text={t("import_provider.back")} kind="lowProfile" size="small" icon="bx-arrow-back" onClick={() => { setProviderId(undefined); setFooter(null); }} />}
            footer={footer}
            footerAlignment="between"
            onHidden={() => setShown(false)}
            show={shown}
        >
            {!provider && (
                <div className="import-provider-picker">
                    <p>{t("import_provider.choose_provider")}</p>
                    {importProviders.map((p) => (
                        <button type="button" className="import-provider-card" key={p.id} onClick={() => setProviderId(p.id)}>
                            <span className="import-provider-card-icon" style={{ "--provider-icon": `url("${p.iconUrl}")` }} />
                            <span className="import-provider-card-text">
                                <span className="import-provider-card-name">{p.name}</span>
                                <span className="import-provider-card-description">{p.description}</span>
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {provider && parentNoteId && <provider.Panel parentNoteId={parentNoteId} closeDialog={closeDialog} setFooter={setFooter} />}
        </Modal>
    );
}
