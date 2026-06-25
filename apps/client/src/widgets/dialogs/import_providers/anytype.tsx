import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { t } from "../../../services/i18n.js";
import importService from "../../../services/import.js";
import Button from "../../react/Button.js";
import FormFileUpload from "../../react/FormFileUpload.js";
import FormGroup from "../../react/FormGroup.js";
import iconUrl from "./icons/anytype.svg?url";
import type { ImportProvider, ImportProviderPanelProps } from "./types.js";

function AnytypePanel({ parentNoteId, closeDialog, setFooter }: ImportProviderPanelProps) {
    const [file, setFile] = useState<File | null>(null);

    const onChange = useCallback((files: FileList | null) => setFile(files?.[0] ?? null), []);

    const doImport = useCallback(async () => {
        if (!file) {
            return;
        }

        // Close immediately and let the shared import toasts (registered in import.ts) report progress,
        // completion and any error. `format: "anytype"` routes the upload to the Anytype importer on the
        // shared file-import endpoint, overriding the .zip extension's default (the generic zip importer).
        // uploadFiles surfaces any upload error via its own toast; swallow the rejection so this void-ed
        // call doesn't raise an unhandled rejection.
        closeDialog();
        await importService.uploadFiles("notes", parentNoteId, [file], { format: "anytype", safeImport: "true", shrinkImages: "false" }).catch(() => {});
    }, [file, parentNoteId, closeDialog]);

    // Keep the latest import handler in a ref so the footer effect depends only on `file` being present,
    // never on doImport's identity — otherwise re-pushing the footer on every change would loop with the
    // parent re-rendering us back (see the Notion/Keep panels for the same reasoning).
    const doImportRef = useRef(doImport);
    doImportRef.current = doImport;

    useEffect(() => {
        setFooter(
            <Button
                text={t("anytype_import.import")}
                kind="primary"
                disabled={!file}
                onClick={() => void doImportRef.current()}
            />
        );
    }, [file, setFooter]);

    useEffect(() => () => setFooter(null), [setFooter]);

    return (
        <div className="anytype-panel">
            <p>{t("anytype_import.description_long")}</p>
            <FormGroup name="anytype-file" label={t("anytype_import.choose_file")}>
                <FormFileUpload onChange={onChange} />
            </FormGroup>
        </div>
    );
}

const provider: ImportProvider = {
    id: "anytype",
    name: t("anytype_import.name"),
    iconUrl,
    description: t("anytype_import.description"),
    Panel: AnytypePanel
};

export default provider;
