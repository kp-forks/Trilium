import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { t } from "../../../services/i18n.js";
import importService, { type UploadFilesOptions } from "../../../services/import.js";
import tree from "../../../services/tree.js";
import Button from "../../react/Button.js";
import FileDropZone from "../../react/FileDropZone.js";
import FormCheckbox from "../../react/FormCheckbox.js";
import FormGroup, { FormMultiGroup } from "../../react/FormGroup.js";
import { useTriliumOptionBool } from "../../react/hooks.js";
import RawHtml from "../../react/RawHtml.js";
import type { ImportProvider, ImportProviderPanelProps } from "./types.js";

function FilesPanel({ parentNoteId, closeDialog, setFooter }: ImportProviderPanelProps) {
    const [compressImages] = useTriliumOptionBool("compressImages");
    const [noteTitle, setNoteTitle] = useState<string>();
    const [files, setFiles] = useState<FileList | null>(null);
    const [safeImport, setSafeImport] = useState(true);
    const [explodeArchives, setExplodeArchives] = useState(true);
    const [shrinkImages, setShrinkImages] = useState(compressImages);
    const [textImportedAsText, setTextImportedAsText] = useState(true);
    const [codeImportedAsCode, setCodeImportedAsCode] = useState(true);
    const [spreadsheetImportedAsSpreadsheet, setSpreadsheetImportedAsSpreadsheet] = useState(true);
    const [replaceUnderscoresWithSpaces, setReplaceUnderscoresWithSpaces] = useState(true);

    useEffect(() => {
        void tree.getNoteTitle(parentNoteId).then(setNoteTitle);
    }, [parentNoteId]);

    const doImport = useCallback(async () => {
        if (!files) {
            return;
        }

        const options: UploadFilesOptions = {
            safeImport: boolToString(safeImport),
            shrinkImages: boolToString(shrinkImages),
            textImportedAsText: boolToString(textImportedAsText),
            codeImportedAsCode: boolToString(codeImportedAsCode),
            spreadsheetImportedAsSpreadsheet: boolToString(spreadsheetImportedAsSpreadsheet),
            explodeArchives: boolToString(explodeArchives),
            replaceUnderscoresWithSpaces: boolToString(replaceUnderscoresWithSpaces)
        };

        // Close immediately and let the shared import toasts (registered in import.ts) report progress,
        // completion and any error. Swallow the rejection so this void-ed call doesn't raise an unhandled
        // rejection.
        closeDialog();
        await importService.uploadFiles("notes", parentNoteId, Array.from(files), options).catch(() => {});
    }, [files, safeImport, shrinkImages, textImportedAsText, codeImportedAsCode, spreadsheetImportedAsSpreadsheet, explodeArchives, replaceUnderscoresWithSpaces, parentNoteId, closeDialog]);

    // Keep the latest import handler in a ref so the footer effect depends only on whether files are
    // selected, never on doImport's identity — otherwise re-pushing the footer on every option toggle
    // would loop with the parent re-rendering us back (see the other panels for the same reasoning).
    const doImportRef = useRef(doImport);
    doImportRef.current = doImport;

    useEffect(() => {
        setFooter(
            <Button text={t("import.import")} kind="primary" disabled={!files} onClick={() => void doImportRef.current()} />
        );
    }, [files, setFooter]);

    return (
        <div className="files-panel">
            <FormGroup name="files" label={t("import.chooseImportFile")} description={
                <>
                    {t("import.importDescription")} <strong>{noteTitle}</strong>.<br />
                    {t("import.importZipRecommendation")}
                </>
            }>
                <FileDropZone multiple onChange={setFiles} />
            </FormGroup>

            <FormMultiGroup label={t("import.options")}>
                <FormCheckbox
                    name="safe-import" hint={t("import.safeImportTooltip")} label={t("import.safeImport")}
                    currentValue={safeImport} onChange={setSafeImport}
                />
                <FormCheckbox
                    name="explode-archives" hint={t("import.explodeArchivesTooltip")} label={<RawHtml html={t("import.explodeArchives")} />}
                    currentValue={explodeArchives} onChange={setExplodeArchives}
                />
                <FormCheckbox
                    name="shrink-images" hint={t("import.shrinkImagesTooltip")} label={t("import.shrinkImages")}
                    currentValue={compressImages && shrinkImages} onChange={setShrinkImages}
                    disabled={!compressImages}
                />
                <FormCheckbox
                    name="text-imported-as-text" label={t("import.textImportedAsText")}
                    currentValue={textImportedAsText} onChange={setTextImportedAsText}
                />
                <FormCheckbox
                    name="code-imported-as-code" label={<RawHtml html={t("import.codeImportedAsCode")} />}
                    currentValue={codeImportedAsCode} onChange={setCodeImportedAsCode}
                />
                <FormCheckbox
                    name="spreadsheet-imported-as-spreadsheet" label={t("import.spreadsheetImportedAsSpreadsheet")}
                    currentValue={spreadsheetImportedAsSpreadsheet} onChange={setSpreadsheetImportedAsSpreadsheet}
                />
                <FormCheckbox
                    name="replace-underscores-with-spaces" label={t("import.replaceUnderscoresWithSpaces")}
                    currentValue={replaceUnderscoresWithSpaces} onChange={setReplaceUnderscoresWithSpaces}
                />
            </FormMultiGroup>
        </div>
    );
}

function boolToString(value: boolean) {
    return value ? "true" : "false";
}

const provider: ImportProvider = {
    id: "files",
    group: "local",
    name: t("import.cardName"),
    icon: "bx bx-import",
    description: t("import.cardDescription"),
    Panel: FilesPanel
};

export default provider;
