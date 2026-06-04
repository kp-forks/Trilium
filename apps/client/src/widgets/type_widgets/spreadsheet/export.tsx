import { FUniver } from "@univerjs/presets";
import { MutableRef } from "preact/hooks";

import NoteContext from "../../../components/note_context";
import FNote from "../../../entities/fnote";
import { t } from "../../../services/i18n";
import toast from "../../../services/toast";
import utils from "../../../services/utils";
import { useTriliumEvent } from "../../react/hooks";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Exports the spreadsheet to an `.xlsx` file when the `exportXlsx` event fires for this note
 * context. The event is raised from the note actions menu and the floating buttons (the same
 * surfaces the PNG/SVG exports use), so it works regardless of Univer's own toolbar (which is
 * hidden in read-only mode). The conversion runs client-side via the `exceljs`-backed exporter
 * in `@triliumnext/commons`, dynamically imported so exceljs is only fetched on export (and
 * never enters the standalone/core bundles).
 */
export default function useSpreadsheetExport(apiRef: MutableRef<FUniver | undefined>, note: FNote, noteContext: NoteContext | null | undefined) {
    useTriliumEvent("exportXlsx", ({ ntxId }) => {
        if (ntxId !== noteContext?.ntxId) return;
        void exportToXlsx(apiRef.current, note);
    });
}

async function exportToXlsx(univerAPI: FUniver | undefined, note: FNote) {
    if (!univerAPI) return;

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
