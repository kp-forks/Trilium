import { useRef, useState } from "preact/hooks";
import Modal from "../react/Modal";
import PdfViewer from "../type_widgets/file/PdfViewer";
import Button from "../react/Button";
import { useTriliumEvent } from "../react/hooks";
import { t } from "../../services/i18n";
import { dynamicRequire } from "../../services/utils";

export interface PrintPreviewData {
    pdfBuffer: Uint8Array;
    title: string;
}

export default function PrintPreviewDialog() {
    const [shown, setShown] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string>();
    const bufferRef = useRef<Uint8Array>();
    const titleRef = useRef("");

    useTriliumEvent("showPrintPreview", (data: PrintPreviewData) => {
        bufferRef.current = data.pdfBuffer;
        titleRef.current = data.title;

        const blob = new Blob([data.pdfBuffer as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
        setShown(true);
    });

    function handleClose() {
        setShown(false);
        if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
            setPdfUrl(undefined);
        }
        bufferRef.current = undefined;
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

    return (
        <Modal
            className="print-preview-dialog"
            title={t("print_preview.title")}
            size="xl"
            show={shown}
            onHidden={handleClose}
            bodyStyle={{ height: "80vh", padding: 0 }}
            footer={
                <>
                    <Button text={t("print_preview.close")} onClick={handleClose} />
                    <Button text={t("print_preview.save")} className="btn-primary" onClick={handleSave} />
                </>
            }
        >
            {pdfUrl && <PdfViewer pdfUrl={pdfUrl} />}
        </Modal>
    );
}
