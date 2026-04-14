import { useCallback, useRef, useState } from "preact/hooks";

import FNote from "../../entities/fnote";
import { t } from "../../services/i18n";
import toast from "../../services/toast";
import { dynamicRequire, isElectron } from "../../services/utils";
import Button, { ButtonGroup } from "../react/Button";
import { useNoteLabelBoolean, useTriliumEvent } from "../react/hooks";
import Modal from "../react/Modal";
import PdfViewer from "../type_widgets/file/PdfViewer";
import OptionsRow from "../type_widgets/options/components/OptionsRow";
import OptionsSection from "../type_widgets/options/components/OptionsSection";

export interface PrintPreviewData {
    pdfBuffer: Uint8Array;
    note: FNote;
    notePath: string;
    pageSize: string;
}

export default function PrintPreviewDialog() {
    const [shown, setShown] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string>();
    const [note, setNote] = useState<FNote>();
    const [loading, setLoading] = useState(false);
    const bufferRef = useRef<Uint8Array>();
    const notePathRef = useRef("");
    const pageSizeRef = useRef("");

    const [landscape, setLandscape] = useNoteLabelBoolean(note, "printLandscape");

    const updatePreview = useCallback((buffer: Uint8Array) => {
        bufferRef.current = buffer;

        // Revoke old URL before creating new one.
        if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
        }

        const blob = new Blob([buffer as BlobPart], { type: "application/pdf" });
        setPdfUrl(URL.createObjectURL(blob));
        setLoading(false);
    }, [pdfUrl]);

    useTriliumEvent("showPrintPreview", (data: PrintPreviewData) => {
        setNote(data.note);
        notePathRef.current = data.notePath;
        pageSizeRef.current = data.pageSize;
        updatePreview(data.pdfBuffer);
        setShown(true);
    });

    function handleClose() {
        setShown(false);
        if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
            setPdfUrl(undefined);
        }
        bufferRef.current = undefined;
        setLoading(false);
    }

    function handleSave() {
        if (!bufferRef.current) return;

        const { ipcRenderer } = dynamicRequire("electron");
        ipcRenderer.send("save-pdf", {
            title: note?.title ?? "",
            buffer: bufferRef.current
        });
        handleClose();
    }

    function handleOrientationChange(newLandscape: boolean) {
        if (newLandscape === landscape) return;
        setLandscape(newLandscape);
        regeneratePreview(newLandscape);
    }

    function regeneratePreview(newLandscape: boolean) {
        if (!isElectron()) return;

        setLoading(true);
        const { ipcRenderer } = dynamicRequire("electron");

        // Listen for the result once.
        const onResult = (_e: any, { buffer }: { buffer: Uint8Array }) => {
            toast.closePersistent("printing");
            updatePreview(buffer);
        };
        ipcRenderer.once("export-as-pdf-preview-result", onResult);

        ipcRenderer.send("export-as-pdf-preview", {
            title: note?.title ?? "",
            notePath: notePathRef.current,
            pageSize: pageSizeRef.current,
            landscape: newLandscape
        });
    }

    return (
        <Modal
            className="print-preview-dialog"
            title={t("print_preview.title")}
            size="xl"
            show={shown}
            onHidden={handleClose}
            bodyStyle={{ height: "78vh", padding: 0, display: "flex" }}
            footer={
                <>
                    <Button text={t("print_preview.close")} onClick={handleClose} />
                    <Button text={t("print_preview.save")} className="btn-primary" onClick={handleSave} disabled={loading} />
                </>
            }
        >
            <div style={{ padding: "16px", minWidth: "250px", overflowY: "auto" }}>
                <OptionsSection>
                    <OptionsRow name="orientation" label={t("print_preview.orientation")}>
                        <ButtonGroup>
                            <Button
                                text={t("print_preview.portrait")}
                                icon="bx-rectangle bx-rotate-90"
                                className={!landscape ? "active" : ""}
                                onClick={() => handleOrientationChange(false)}
                                disabled={loading}
                                size="small"
                            />
                            <Button
                                text={t("print_preview.landscape")}
                                icon="bx-rectangle"
                                className={landscape ? "active" : ""}
                                onClick={() => handleOrientationChange(true)}
                                disabled={loading}
                                size="small"
                            />
                        </ButtonGroup>
                    </OptionsRow>
                </OptionsSection>
            </div>

            <div style={{ flex: 1, position: "relative" }}>
                {loading && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, backgroundColor: "var(--modal-bg-color, rgba(255,255,255,0.8))" }}>
                        <span class="bx bx-loader-circle bx-spin" style={{ fontSize: "2rem" }} />
                    </div>
                )}
                {pdfUrl && <PdfViewer pdfUrl={pdfUrl} />}
            </div>
        </Modal>
    );
}
