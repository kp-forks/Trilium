/**
 * Converts a UniversJS workbook JSON structure into a CSV file (RFC 4180).
 *
 * CSV is a flat, single-sheet, value-only format: it carries no styling, merges, or
 * formulas. So this emitter throws away everything the HTML/XLSX emitters preserve and
 * keeps only the cell values, laid out as a dense rectangle over the sheet's populated
 * bounds. Formula cells export their cached result (Univer stores it in `v`); numbers and
 * dates export their raw underlying value rather than the formatted display string, which
 * is what downstream CSV consumers expect.
 *
 * Because CSV holds a single sheet, the caller picks which one via `sheetId` (e.g. the
 * active sheet in the editor); absent that, the first visible sheet is used.
 */

import {
    computeBounds,
    getVisibleSheets,
    type ICellData,
    type IWorksheetData,
    parseWorkbookData
} from "./workbook_model.js";

export interface CsvRenderOptions {
    /** Id of the sheet to export. Falls back to the first visible sheet when omitted or not found. */
    sheetId?: string;
}

/**
 * Parses the raw JSON content of a spreadsheet note and renders a single sheet as CSV.
 * Hidden rows and columns are still exported (their data is part of the sheet). Returns
 * an empty string for an empty sheet. Throws if the content is not a parseable workbook.
 */
export function renderSpreadsheetToCsv(jsonContent: string, options: CsvRenderOptions = {}): string {
    const { ok, data } = parseWorkbookData(jsonContent);
    if (!ok) {
        throw new Error("Unable to parse spreadsheet data.");
    }

    if (!data?.workbook?.sheets) {
        throw new Error("Spreadsheet contains no sheets.");
    }

    const visibleSheets = getVisibleSheets(data.workbook);
    if (visibleSheets.length === 0) {
        return "";
    }

    const sheet = pickSheet(visibleSheets, options.sheetId);
    return renderSheet(sheet);
}

function pickSheet(visibleSheets: IWorksheetData[], sheetId: string | undefined): IWorksheetData {
    if (sheetId) {
        const match = visibleSheets.find((s) => s.id === sheetId);
        if (match) return match;
    }
    return visibleSheets[0];
}

function renderSheet(sheet: IWorksheetData): string {
    const { cellData } = sheet;
    const bounds = computeBounds(cellData, sheet.mergeData);
    if (!bounds) {
        return "";
    }

    const { minRow, maxRow, minCol, maxCol } = bounds;
    const lines: string[] = [];

    for (let row = minRow; row <= maxRow; row++) {
        const cells: string[] = [];
        for (let col = minCol; col <= maxCol; col++) {
            cells.push(escapeCsvField(cellText(cellData[row]?.[col])));
        }
        lines.push(cells.join(","));
    }

    // RFC 4180 uses CRLF as the record separator.
    return lines.join("\r\n");
}

/** Extracts a cell's plain-text value. Formula cells use their cached result (`v`). */
function cellText(cell: ICellData | undefined): string {
    if (!cell || cell.v == null) return "";
    if (typeof cell.v === "boolean") return cell.v ? "TRUE" : "FALSE";
    return String(cell.v);
}

/**
 * Quotes a field per RFC 4180 when it contains a comma, double quote, CR, or LF;
 * embedded double quotes are doubled. Plain fields pass through unchanged.
 */
function escapeCsvField(value: string): string {
    if (/[",\r\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
