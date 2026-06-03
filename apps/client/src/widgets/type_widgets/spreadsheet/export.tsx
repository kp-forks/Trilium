import { FUniver } from "@univerjs/presets";
import { MutableRef, useEffect, useRef } from "preact/hooks";

import FNote from "../../../entities/fnote";
import { t } from "../../../services/i18n";
import toast from "../../../services/toast";
import utils from "../../../services/utils";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ICON_ID = "trilium-export-xlsx-icon";
const MENU_ID = "trilium.spreadsheet.export-xlsx";

/**
 * Adds an "Export to Excel" entry to the Univer toolbar (and right-click menu) that
 * serializes the live workbook and downloads it as an `.xlsx` file. The conversion runs
 * client-side via the `exceljs`-backed exporter in `@triliumnext/commons`, dynamically
 * imported so exceljs is only fetched when the user actually exports (and never enters the
 * standalone/core bundles).
 *
 * Note: Univer hides its toolbar and context menu in read-only mode, so this entry is only
 * reachable while the note is editable.
 */
export default function useSpreadsheetExport(apiRef: MutableRef<FUniver | undefined>, note: FNote) {
    // The Univer instance is reused across notes, so keep the latest note in a ref and have
    // the action (registered once) read it at click time rather than capturing a stale note.
    const noteRef = useRef(note);
    noteRef.current = note;

    useEffect(() => {
        const univerAPI = apiRef.current;
        if (!univerAPI) return;

        try {
            // Toolbar buttons need a registered icon component to render at all.
            univerAPI.registerComponent(ICON_ID, ExportIcon);

            const menu = univerAPI.createMenu({
                id: MENU_ID,
                icon: ICON_ID,
                title: t("spreadsheet.export-xlsx"),
                tooltip: t("spreadsheet.export-xlsx"),
                action: () => void exportToXlsx(univerAPI, noteRef.current)
            });
            // appendTo takes a single position string; call once per location (an array is
            // interpreted as one nested path, not several positions).
            menu.appendTo("ribbon.start.others");
            menu.appendTo("contextMenu.others");
        } catch (e) {
            console.error("Failed to register spreadsheet export menu", e);
        }
    }, [ apiRef ]);
}

function ExportIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 1.5v7.5m0 0L5.2 6.2M8 9l2.8-2.8" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2.75 10.5v1.75A1.25 1.25 0 0 0 4 13.5h8a1.25 1.25 0 0 0 1.25-1.25V10.5" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

async function exportToXlsx(univerAPI: FUniver, note: FNote) {
    try {
        const workbook = univerAPI.getActiveWorkbook();
        if (!workbook) return;

        // Serialize the live workbook in the same shape the note is persisted in.
        const json = JSON.stringify({ version: 1, workbook: workbook.save() });

        // Dynamic import keeps exceljs out of the main bundle (and out of standalone/core).
        const { renderSpreadsheetToXlsx } = await import("@triliumnext/commons/src/lib/spreadsheet/render_to_xlsx");
        const buffer = await renderSpreadsheetToXlsx(json);

        // Download via a data URL (utils.triggerDownload): a blob-URL anchor click after these
        // awaits gets silently blocked once the user-activation is consumed, whereas the
        // data-URL path used by downloadAsPng/Svg works.
        const dataUrl = await blobToDataUrl(new Blob([buffer as BlobPart], { type: XLSX_MIME }));
        utils.triggerDownload(`${note.title || "spreadsheet"}.xlsx`, dataUrl);
    } catch (e) {
        console.error("[spreadsheet-export] failed", e);
        toast.showError(t("spreadsheet.export-failed"));
    }
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}
