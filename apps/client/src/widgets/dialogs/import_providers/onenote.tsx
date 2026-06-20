import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { t } from "../../../services/i18n.js";
import onenoteImport, { type OneNoteAccount, type OneNoteNotebook, type OneNoteSectionSelection } from "../../../services/onenote_import.js";
import toast from "../../../services/toast.js";
import { isElectron, randomString } from "../../../services/utils.js";
import Button from "../../react/Button.js";
import FormCheckbox from "../../react/FormCheckbox.js";
import LoadingSpinner from "../../react/LoadingSpinner.js";
import type { ImportProvider, ImportProviderPanelProps } from "./types.js";

type Phase = "checking" | "disconnected" | "connecting" | "ready";

function OneNotePanel({ parentNoteId, closeDialog }: ImportProviderPanelProps) {
    const [phase, setPhase] = useState<Phase>("checking");
    const [account, setAccount] = useState<OneNoteAccount | null>(null);
    const [notebooks, setNotebooks] = useState<OneNoteNotebook[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [debug, setDebug] = useState(false);
    const [importing, setImporting] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const loadNotebooks = useCallback(async () => {
        try {
            const { notebooks } = await onenoteImport.getNotebooks();
            setNotebooks(notebooks);
        } catch {
            toast.showError(t("onenote_import.load_failed"));
        }
    }, []);

    // On mount, see whether this session is already connected.
    useEffect(() => {
        void onenoteImport.getStatus().then(async (status) => {
            if (status.connected) {
                setAccount(status.account);
                await loadNotebooks();
                setPhase("ready");
            } else {
                setPhase("disconnected");
            }
        });
        return stopPolling;
    }, [loadNotebooks, stopPolling]);

    const connect = useCallback(async () => {
        try {
            const { authUrl } = await onenoteImport.getAuthUrl();
            if (isElectron()) {
                window.electronApi?.shell.openExternal(authUrl);
            } else {
                window.open(authUrl, "_blank", "noopener,noreferrer");
            }

            setPhase("connecting");
            stopPolling();
            pollRef.current = setInterval(async () => {
                const status = await onenoteImport.getStatus();
                if (status.connected) {
                    stopPolling();
                    setAccount(status.account);
                    await loadNotebooks();
                    setPhase("ready");
                }
            }, 2000);
        } catch (e) {
            toast.showError(e instanceof Error ? e.message : String(e));
            setPhase("disconnected");
        }
    }, [loadNotebooks, stopPolling]);

    const disconnect = useCallback(async () => {
        stopPolling();
        await onenoteImport.disconnect();
        setAccount(null);
        setNotebooks([]);
        setSelectedIds(new Set());
        setPhase("disconnected");
    }, [stopPolling]);

    const toggleSection = useCallback((id: string, checked: boolean) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (checked) {
                next.add(id);
            } else {
                next.delete(id);
            }
            return next;
        });
    }, []);

    const doImport = useCallback(async () => {
        const sections: OneNoteSectionSelection[] = [];
        for (const notebook of notebooks) {
            for (const section of notebook.sections) {
                if (selectedIds.has(section.id)) {
                    sections.push({ id: section.id, title: section.title, notebookTitle: notebook.title });
                }
            }
        }
        if (!sections.length) {
            return;
        }

        setImporting(true);
        try {
            await onenoteImport.runImport({ parentNoteId, sections, taskId: randomString(10), debug });
            toast.showMessage(t("onenote_import.import_started"));
            closeDialog();
        } catch (e) {
            toast.showError(e instanceof Error ? e.message : String(e));
            setImporting(false);
        }
    }, [notebooks, selectedIds, parentNoteId, debug, closeDialog]);

    if (phase === "checking") {
        return <div className="onenote-panel"><LoadingSpinner /></div>;
    }

    if (phase === "disconnected" || phase === "connecting") {
        return (
            <div className="onenote-panel">
                <p>{t("onenote_import.connect_description")}</p>
                {phase === "connecting"
                    ? <p className="onenote-status"><LoadingSpinner /> {t("onenote_import.connecting")}</p>
                    : <Button text={t("onenote_import.connect")} kind="primary" icon="bxl-microsoft" onClick={connect} />}
            </div>
        );
    }

    return (
        <div className="onenote-panel">
            <div className="onenote-account">
                <span>{t("onenote_import.connected_as", { name: account?.name ?? "" })}</span>
                <Button text={t("onenote_import.disconnect")} kind="lowProfile" size="small" onClick={disconnect} />
            </div>

            {notebooks.length === 0
                ? <p>{t("onenote_import.no_notebooks")}</p>
                : (
                    <>
                        <p>{t("onenote_import.select_sections")}</p>
                        <div className="onenote-notebooks">
                            {notebooks.map((notebook) => (
                                <div className="onenote-notebook" key={notebook.id}>
                                    <strong>{notebook.title}</strong>
                                    {notebook.sections.map((section) => (
                                        <FormCheckbox
                                            key={section.id}
                                            name={`onenote-section-${section.id}`}
                                            label={section.title}
                                            currentValue={selectedIds.has(section.id)}
                                            onChange={(checked) => toggleSection(section.id, checked)}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </>
                )}

            <div className="onenote-actions">
                <FormCheckbox
                    name="onenote-debug"
                    label={t("onenote_import.attach_source")}
                    hint={t("onenote_import.attach_source_hint")}
                    currentValue={debug}
                    onChange={setDebug}
                />
                <Button
                    text={t("onenote_import.import")}
                    kind="primary"
                    disabled={importing || selectedIds.size === 0}
                    onClick={doImport}
                />
            </div>
        </div>
    );
}

const provider: ImportProvider = {
    id: "onenote",
    name: t("onenote_import.name"),
    icon: "bx bxl-microsoft",
    description: t("onenote_import.description"),
    Panel: OneNotePanel
};

export default provider;
