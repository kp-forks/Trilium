import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { t } from "../../../services/i18n.js";
import notionImport from "../../../services/notion_import.js";
import toast from "../../../services/toast.js";
import Button from "../../react/Button.js";
import FormFileUpload from "../../react/FormFileUpload.js";
import FormGroup from "../../react/FormGroup.js";
import type { ImportProvider, ImportProviderPanelProps } from "./types.js";

function NotionPanel({ parentNoteId, closeDialog, setFooter }: ImportProviderPanelProps) {
    const [file, setFile] = useState<File | null>(null);

    const onChange = useCallback((files: FileList | null) => setFile(files?.[0] ?? null), []);

    const doImport = useCallback(async () => {
        if (!file) {
            return;
        }

        // Close immediately and let the shared import toasts report progress, completion and any error.
        // The request returns as soon as the server accepts it (the import runs in the background), so the
        // only errors caught here are upfront ones like an upload failure.
        closeDialog();
        try {
            await notionImport.runImport({ parentNoteId, file });
        } catch (e) {
            toast.showError(e instanceof Error ? e.message : String(e));
        }
    }, [file, parentNoteId, closeDialog]);

    // Keep the latest import handler in a ref so the footer effect depends only on `file` being present,
    // never on doImport's identity — otherwise re-pushing the footer on every change would loop with the
    // parent re-rendering us back (see the OneNote panel for the same reasoning).
    const doImportRef = useRef(doImport);
    doImportRef.current = doImport;

    useEffect(() => {
        setFooter(
            <Button
                text={t("notion_import.import")}
                kind="primary"
                disabled={!file}
                onClick={() => void doImportRef.current()}
            />
        );
    }, [file, setFooter]);

    useEffect(() => () => setFooter(null), [setFooter]);

    return (
        <div className="notion-panel">
            <p>{t("notion_import.description_long")}</p>
            <FormGroup name="notion-file" label={t("notion_import.choose_file")}>
                <FormFileUpload onChange={onChange} />
            </FormGroup>
        </div>
    );
}

const provider: ImportProvider = {
    id: "notion",
    name: t("notion_import.name"),
    icon: "bx bxs-file-archive",
    description: t("notion_import.description"),
    Panel: NotionPanel
};

export default provider;
