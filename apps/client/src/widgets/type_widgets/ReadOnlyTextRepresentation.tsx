import { useEffect, useState } from "preact/hooks";

import { t } from "../../services/i18n";
import server from "../../services/server";
import toast from "../../services/toast";
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
        <div className="note-detail-printable" style={{ padding: "10px" }}>
            <div style={{
                marginBottom: "10px",
                padding: "8px 12px",
                backgroundColor: "var(--main-background-color)",
                border: "1px solid var(--main-border-color)",
                borderRadius: "4px",
                fontWeight: 500
            }}>
                <span className="bx bx-text" />{" "}{t("ocr.extracted_text_title")}
            </div>

            {state.kind === "loading" && (
                <div style={{ textAlign: "center", padding: "30px", color: "var(--muted-text-color)" }}>
                    <span className="bx bx-loader-alt bx-spin" />{" "}{t("ocr.loading_text")}
                </div>
            )}

            {state.kind === "loaded" && (
                <>
                    <pre style={{
                        whiteSpace: "pre-wrap",
                        fontFamily: "var(--detail-text-font-family)",
                        fontSize: "var(--detail-text-font-size)",
                        lineHeight: 1.6,
                        border: "1px solid var(--main-border-color)",
                        borderRadius: "4px",
                        padding: "15px",
                        backgroundColor: "var(--accented-background-color)",
                        minHeight: "100px"
                    }}>
                        {state.text}
                    </pre>
                    <div style={{ fontSize: "0.9em", color: "var(--muted-text-color)", marginTop: "10px", fontStyle: "italic" }}>
                        {t("ocr.extracted_on", { date: state.extractedAt ? new Date(state.extractedAt).toLocaleString() : t("ocr.unknown_date") })}
                    </div>
                </>
            )}

            {state.kind === "empty" && (
                <>
                    <div style={{ color: "var(--muted-text-color)", fontStyle: "italic", textAlign: "center", padding: "30px" }}>
                        <span className="bx bx-info-circle" />{" "}{t("ocr.no_text_available")}
                    </div>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ marginTop: "15px" }}
                        disabled={processing}
                        onClick={processOCR}
                    >
                        {processing
                            ? <><span className="bx bx-loader-alt bx-spin" />{" "}{t("ocr.processing")}</>
                            : <><span className="bx bx-play" />{" "}{t("ocr.process_now")}</>
                        }
                    </button>
                    <div style={{ fontSize: "0.9em", color: "var(--muted-text-color)", marginTop: "10px", fontStyle: "italic" }}>
                        {t("ocr.no_text_explanation")}
                    </div>
                </>
            )}

            {state.kind === "error" && (
                <div style={{
                    color: "var(--error-color)",
                    backgroundColor: "var(--error-background-color)",
                    border: "1px solid var(--error-border-color)",
                    padding: "10px",
                    borderRadius: "4px",
                    marginTop: "10px"
                }}>
                    <span className="bx bx-error" />{" "}{state.message}
                </div>
            )}
        </div>
    );
}
