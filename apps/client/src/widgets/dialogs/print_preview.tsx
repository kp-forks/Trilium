import { useCallback, useRef, useState } from "preact/hooks";

import { t } from "../../services/i18n";
import toast from "../../services/toast";
import { dynamicRequire, isElectron } from "../../services/utils";
import Button from "../react/Button";
import { useTriliumEvent } from "../react/hooks";
import Modal from "../react/Modal";
import PdfViewer from "../type_widgets/file/PdfViewer";
import { OptionsRowWithToggle } from "../type_widgets/options/components/OptionsRow";
import OptionsSection from "../type_widgets/options/components/OptionsSection";

export interface PrintPreviewData {
    pdfBuffer: Uint8Array;
    title: string;
    notePath: string;
    pageSize: string;
    landscape: boolean;
}

export default function PrintPreviewDialog() {
    const [shown, setShown] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string>();
    const [landscape, setLandscape] = useState(false);
    const [loading, setLoading] = useState(false);
    const bufferRef = useRef<Uint8Array>();
    const titleRef = useRef("");
    const notePathRef = useRef("");
    const pageSizeRef = useRef("");

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
        titleRef.current = data.title;
        notePathRef.current = data.notePath;
        pageSizeRef.current = data.pageSize;
        setLandscape(data.landscape);
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
            title: titleRef.current,
            buffer: bufferRef.current
        });
        handleClose();
    }

    function handleLandscapeToggle(newValue: boolean) {
        setLandscape(newValue);
        regeneratePreview(newValue);
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
            title: titleRef.current,
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
                    <OptionsRowWithToggle
                        name="printLandscape"
                        label={t("print_preview.landscape")}
                        currentValue={landscape}
                        onChange={handleLandscapeToggle}
                        disabled={loading}
                    />
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
