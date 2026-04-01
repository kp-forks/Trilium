import "./ReadOnlyTextRepresentation.css";

import { useEffect, useState } from "preact/hooks";

import { t } from "../../services/i18n";
import server from "../../services/server";
import toast from "../../services/toast";
import { formatDateTime } from "../../services/utils";
import { TypeWidgetProps } from "./type_widget";

interface TextRepresentationResponse {
    success: boolean;
    text: string;
    hasOcr: boolean;
    extractedAt: string | null;
    message?: string;
}

type State =
    | { kind: "loading" }
    | { kind: "loaded"; text: string; extractedAt: string | null }
    | { kind: "empty" }
    | { kind: "error"; message: string };

export default function ReadOnlyTextRepresentation({ note }: TypeWidgetProps) {
    const [ state, setState ] = useState<State>({ kind: "loading" });
    const [ processing, setProcessing ] = useState(false);

    async function fetchText() {
        setState({ kind: "loading" });

        try {
            const response = await server.get<TextRepresentationResponse>(`ocr/notes/${note.noteId}/text`);

            if (!response.success) {
                setState({ kind: "error", message: response.message || t("ocr.failed_to_load") });
                return;
            }

            if (!response.hasOcr || !response.text) {
                setState({ kind: "empty" });
                return;
            }

            setState({ kind: "loaded", text: response.text, extractedAt: response.extractedAt });
        } catch (error: any) {
            console.error("Error loading text representation:", error);
            setState({ kind: "error", message: error.message || t("ocr.failed_to_load") });
        }
    }

    useEffect(() => { fetchText(); }, [ note.noteId ]);

    async function processOCR() {
        setProcessing(true);
        try {
            const response = await server.post<{ success: boolean; message?: string }>(`ocr/process-note/${note.noteId}`);
            if (response.success) {
                toast.showMessage(t("ocr.processing_started"));
                setTimeout(fetchText, 2000);
            } else {
                toast.showError(response.message || t("ocr.processing_failed"));
            }
        } catch {
            // Server errors (4xx/5xx) are already shown as toasts by server.ts.
        } finally {
            setProcessing(false);
        }
    }

    return (
        <div className="text-representation note-detail-printable">
            <div className="text-representation-header">
                <span className="bx bx-text" />{" "}{t("ocr.extracted_text_title")}
            </div>

            {state.kind === "loading" && (
                <div className="text-representation-loading">
                    <span className="bx bx-loader-alt bx-spin" />{" "}{t("ocr.loading_text")}
                </div>
            )}

            {state.kind === "loaded" && (
                <>
                    <pre className="text-representation-content">
                        {state.text}
                    </pre>
                    {state.extractedAt && (
                        <div className="text-representation-meta">
                            {t("ocr.extracted_on", { date: formatDateTime(new Date(state.extractedAt)) })}
                        </div>
                    )}
                </>
            )}

            {state.kind === "empty" && (
                <>
                    <div className="text-representation-empty">
                        <span className="bx bx-info-circle" />{" "}{t("ocr.no_text_available")}
                    </div>
                    <button
                        type="button"
                        className="btn btn-secondary text-representation-process-btn"
                        disabled={processing}
                        onClick={processOCR}
                    >
                        {processing
                            ? <><span className="bx bx-loader-alt bx-spin" />{" "}{t("ocr.processing")}</>
                            : <><span className="bx bx-play" />{" "}{t("ocr.process_now")}</>
                        }
                    </button>
                    <div className="text-representation-meta">
                        {t("ocr.no_text_explanation")}
                    </div>
                </>
            )}

            {state.kind === "error" && (
                <div className="text-representation-error">
                    <span className="bx bx-error" />{" "}{state.message}
                </div>
            )}
        </div>
    );
}
