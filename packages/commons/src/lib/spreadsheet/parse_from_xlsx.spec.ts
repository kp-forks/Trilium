import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { parseXlsxToWorkbook } from "./parse_from_xlsx.js";
import {
    BorderStyle,
    CellValueType,
    HorizontalAlign,
    type ICellData,
    type IStyleData,
    type IWorksheetData,
    VerticalAlign,
    WrapStrategy
} from "./workbook_model.js";

/** Build an xlsx in memory, parse it back, and return the requested sheet's Univer data. */
async function roundTrip(build: (wb: ExcelJS.Workbook) => void, sheetIndex = 0): Promise<IWorksheetData> {
    const wb = new ExcelJS.Workbook();
    build(wb);
    const buffer = await wb.xlsx.writeBuffer();
    const { workbook } = await parseXlsxToWorkbook(buffer as ArrayBuffer);
    const id = workbook.sheetOrder[sheetIndex];
    return workbook.sheets[id];
}

/** Convenience: the single styled cell at A1 (row 0, col 0). */
function cellA1(sheet: IWorksheetData): ICellData | undefined {
    return sheet.cellData[0]?.[0];
}

/** The inline style object on a cell — the importer never emits string style references. */
function styleOf(cell: ICellData | undefined): IStyleData {
    const s = cell?.s;
    return s && typeof s === "object" ? s : {};
}

describe("parseXlsxToWorkbook", () => {
    it("reads string, number and boolean values with their cell types", async () => {
        const sheet = await roundTrip((wb) => {
            const ws = wb.addWorksheet("Ledger");
            ws.getCell("A1").value = "Hello";
            ws.getCell("B1").value = 42;
            ws.getCell("C1").value = true;
        });

        expect(sheet.name).toBe("Ledger");
        expect(sheet.cellData[0][0]).toMatchObject({ v: "Hello", t: CellValueType.STRING });
        expect(sheet.cellData[0][1]).toMatchObject({ v: 42, t: CellValueType.NUMBER });
        expect(sheet.cellData[0][2]).toMatchObject({ v: true, t: CellValueType.BOOLEAN });
    });

    it("reads a formula and re-adds the leading '='", async () => {
        const sheet = await roundTrip((wb) => {
            const ws = wb.addWorksheet("S");
            ws.getCell("A1").value = { formula: "SUM(B1:B2)", result: 7 } as ExcelJS.CellFormulaValue;
        });
        expect(cellA1(sheet)).toMatchObject({ f: "=SUM(B1:B2)", v: 7, t: CellValueType.NUMBER });
    });

    it("reads font styling and an explicit ARGB color", async () => {
        const sheet = await roundTrip((wb) => {
            const ws = wb.addWorksheet("S");
            const cell = ws.getCell("A1");
            cell.value = "f";
            cell.font = { name: "Arial", size: 14, bold: true, italic: true, underline: true, strike: true, color: { argb: "FF414657" } };
        });
        expect(cellA1(sheet)?.s).toMatchObject({
            ff: "Arial", fs: 14, bl: 1, it: 1, ul: { s: 1 }, st: { s: 1 }, cl: { rgb: "#414657" }
        });
    });

    it("does not capture the workbook-default font as an explicit font", async () => {
        // A cell with other styling (number format) but no explicit font: exceljs reports the
        // theme-default Calibri 11 — which must NOT become an explicit font, so the cell keeps
        // inheriting Univer's default font.
        const sheet = await roundTrip((wb) => {
            const ws = wb.addWorksheet("S");
            const cell = ws.getCell("A1");
            cell.value = 5;
            cell.numFmt = "0.00";
        });
        const style = styleOf(cellA1(sheet));
        expect(style.ff).toBeUndefined();
        expect(style.fs).toBeUndefined();
        expect(style.cl).toBeUndefined();
        expect(style.n).toMatchObject({ pattern: "0.00" });
    });

    it("keeps an explicit font size/color on a default-family font", async () => {
        // No explicit family, but an explicit size and color — both must survive even though the
        // family is left to the theme default.
        const sheet = await roundTrip((wb) => {
            const ws = wb.addWorksheet("S");
            const cell = ws.getCell("A1");
            cell.value = "x";
            cell.font = { size: 19, color: { argb: "FF036672" } };
        });
        expect(cellA1(sheet)?.s).toMatchObject({ fs: 19, cl: { rgb: "#036672" } });
        expect(styleOf(cellA1(sheet)).ff).toBeUndefined();
    });

    it("reads a solid fill into the background color", async () => {
        const sheet = await roundTrip((wb) => {
            const ws = wb.addWorksheet("S");
            const cell = ws.getCell("A1");
            cell.value = "x";
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9F9F9" } };
        });
        expect(cellA1(sheet)?.s).toMatchObject({ bg: { rgb: "#F9F9F9" } });
    });

    it("reads alignment and wrap", async () => {
        const sheet = await roundTrip((wb) => {
            const ws = wb.addWorksheet("S");
            const cell = ws.getCell("A1");
            cell.value = "x";
            cell.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
        });
        expect(cellA1(sheet)?.s).toMatchObject({
            ht: HorizontalAlign.RIGHT, vt: VerticalAlign.MIDDLE, tb: WrapStrategy.WRAP
        });
    });

    it("maps exceljs border styles back to the Univer enum", async () => {
        const sheet = await roundTrip((wb) => {
            const ws = wb.addWorksheet("S");
            const cell = ws.getCell("A1");
            cell.value = "b";
            cell.border = {
                top: { style: "thin", color: { argb: "FF111111" } },
                right: { style: "medium", color: { argb: "FF222222" } },
                bottom: { style: "thick", color: { argb: "FF333333" } },
                left: { style: "dotted", color: { argb: "FF444444" } }
            };
        });
        expect(cellA1(sheet)?.s).toMatchObject({
            bd: {
                t: { s: BorderStyle.THIN, cl: { rgb: "#111111" } },
                r: { s: BorderStyle.MEDIUM },
                b: { s: BorderStyle.THICK },
                l: { s: BorderStyle.DOTTED }
            }
        });
    });

    it("reads the number-format pattern verbatim", async () => {
        const sheet = await roundTrip((wb) => {
            const ws = wb.addWorksheet("S");
            const cell = ws.getCell("A1");
            cell.value = 1234.5;
            cell.numFmt = "#,##0.00;[Red]#,##0.00";
        });
        expect(cellA1(sheet)?.s).toMatchObject({ n: { pattern: "#,##0.00;[Red]#,##0.00" } });
    });

    it("reads merges as 0-based inclusive ranges", async () => {
        const sheet = await roundTrip((wb) => {
            const ws = wb.addWorksheet("S");
            ws.getCell("A1").value = "merged";
            ws.mergeCells("A1:B2");
        });
        expect(sheet.mergeData).toEqual([{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 }]);
    });

    it("converts column width (chars) and row height (points) back to pixels", async () => {
        const sheet = await roundTrip((wb) => {
            const ws = wb.addWorksheet("S");
            ws.getCell("A1").value = "x";
            ws.getColumn(1).width = 16;
            ws.getRow(1).height = 30;
        });
        // 16 chars -> 16*7+5 = 117px; 30pt -> 30/0.75 = 40px.
        expect(sheet.columnData?.[0]?.w).toBeCloseTo(117, 1);
        expect(sheet.rowData?.[0]?.h).toBeCloseTo(40, 1);
    });

    it("flags hidden sheets, rows and columns", async () => {
        const sheet = await roundTrip((wb) => {
            const ws = wb.addWorksheet("Secret", { state: "hidden" });
            ws.getCell("A1").value = "x";
            ws.getColumn(1).hidden = true;
            ws.getRow(1).hidden = true;
        });
        expect(sheet.hidden).toBe(1);
        expect(sheet.columnData?.[0]?.hd).toBe(1);
        expect(sheet.rowData?.[0]?.hd).toBe(1);
    });

    it("keeps the background of an empty (value-less) styled cell", async () => {
        const sheet = await roundTrip((wb) => {
            const ws = wb.addWorksheet("S");
            ws.getCell("A1").value = "x";
            // B1 has only a fill, no value — must still survive the round-trip.
            ws.getCell("B1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9F9F9" } };
        });
        expect(sheet.cellData[0][1]?.s).toMatchObject({ bg: { rgb: "#F9F9F9" } });
    });

    it("reads the sheet default row height and column width", async () => {
        const sheet = await roundTrip((wb) => {
            const ws = wb.addWorksheet("S", { properties: { defaultRowHeight: 18, defaultColWidth: 11.857 } });
            ws.getCell("A1").value = "x";
        });
        // 18pt -> 18/0.75 = 24px; 11.857 chars -> 11.857*7+5 ≈ 88px.
        expect(sheet.defaultRowHeight).toBeCloseTo(24, 0);
        expect(sheet.defaultColumnWidth).toBeCloseTo(88, 0);
    });

    it("preserves sheet order across multiple sheets", async () => {
        const wb = new ExcelJS.Workbook();
        wb.addWorksheet("First").getCell("A1").value = "1";
        wb.addWorksheet("Second").getCell("A1").value = "2";
        const buffer = await wb.xlsx.writeBuffer();
        const { workbook } = await parseXlsxToWorkbook(buffer as ArrayBuffer);
        expect(workbook.sheetOrder.map((id) => workbook.sheets[id].name)).toEqual(["First", "Second"]);
    });

    it("throws on a non-xlsx buffer", async () => {
        await expect(parseXlsxToWorkbook(new Uint8Array([1, 2, 3]))).rejects.toThrow(/parse/i);
    });
});
