import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { t } from "../../../services/i18n.js";
import importService from "../../../services/import.js";
import Button from "../../react/Button.js";
import FormFileUpload from "../../react/FormFileUpload.js";
import FormGroup from "../../react/FormGroup.js";
import type { ImportProvider, ImportProviderPanelProps } from "./types.js";

function EvernotePanel({ parentNoteId, closeDialog, setFooter }: ImportProviderPanelProps) {
    const [files, setFiles] = useState<File[]>([]);

    // An Evernote export is one ENEX (.enex) file per notebook, so allow selecting several at once.
    const onChange = useCallback((fileList: FileList | null) => setFiles(fileList ? Array.from(fileList) : []), []);

    const doImport = useCallback(async () => {
        if (!files.length) {
            return;
        }

        // Close immediately and let the shared import toasts (registered in import.ts) report progress,
        // completion and any error. Unlike Notion (a .zip that needs an explicit format tag), an ENEX
        // upload is routed by its .enex extension on the shared file-import endpoint, so no format is set;
        // each file becomes its own notebook root. uploadFiles surfaces upload errors via its own toast,
        // so swallow the rejection to avoid an unhandled rejection from this void-ed call.
        closeDialog();
        await importService.uploadFiles("notes", parentNoteId, files, { safeImport: "true", shrinkImages: "true" }).catch(() => {});
    }, [files, parentNoteId, closeDialog]);

    // Keep the latest import handler in a ref so the footer effect depends only on whether files are
    // selected, never on doImport's identity — otherwise re-pushing the footer on every change would loop
    // with the parent re-rendering us back (see the Notion/OneNote panels for the same reasoning).
    const doImportRef = useRef(doImport);
    doImportRef.current = doImport;

    useEffect(() => {
        setFooter(
            <Button
                text={t("evernote_import.import")}
                kind="primary"
                disabled={!files.length}
                onClick={() => void doImportRef.current()}
            />
        );
    }, [files.length, setFooter]);

    useEffect(() => () => setFooter(null), [setFooter]);

    return (
        <div className="evernote-panel">
            <p>{t("evernote_import.description_long")}</p>
            <FormGroup name="evernote-file" label={t("evernote_import.choose_file")}>
                <FormFileUpload multiple onChange={onChange} />
            </FormGroup>
        </div>
    );
}

const provider: ImportProvider = {
    id: "evernote",
    name: t("evernote_import.name"),
    icon: "bx bx-import",
    description: t("evernote_import.description"),
    Panel: EvernotePanel
};

export default provider;
