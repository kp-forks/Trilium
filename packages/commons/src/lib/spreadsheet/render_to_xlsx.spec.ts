import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";

import { renderSpreadsheetToXlsx } from "./render_to_xlsx.js";

/** Wrap a single styled cell (at A1 / row 0, col 0) into a complete workbook payload. */
function singleCellWorkbook(cell: unknown, sheetExtra: Record<string, unknown> = {}, styles: Record<string, unknown> = {}): string {
    return JSON.stringify({
        version: 1,
        workbook: {
            sheetOrder: ["s1"],
            styles,
            sheets: {
                s1: {
                    id: "s1",
                    name: "Sheet1",
                    hidden: 0,
                    mergeData: [],
                    cellData: { "0": { "0": cell } },
                    rowData: {},
                    columnData: {},
                    ...sheetExtra
                }
            }
        }
    });
}

/** Render to xlsx and read it back so assertions run against real OOXML output. */
async function roundTrip(json: string): Promise<ExcelJS.Workbook> {
    const buffer = await renderSpreadsheetToXlsx(json);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as ArrayBuffer);
    return wb;
}

describe("renderSpreadsheetToXlsx", () => {
    it("writes sheet name and string/number/boolean values", async () => {
        const json = JSON.stringify({
            version: 1,
            workbook: {
                sheetOrder: ["s1"],
                styles: {},
                sheets: {
                    s1: {
                        id: "s1",
                        name: "Ledger",
                        hidden: 0,
                        mergeData: [],
                        cellData: {
                            "0": { "0": { v: "Hello", t: 1 }, "1": { v: 42, t: 2 }, "2": { v: true, t: 3 } }
                        },
                        rowData: {},
                        columnData: {}
                    }
                }
            }
        });

        const ws = (await roundTrip(json)).getWorksheet("Ledger");
        expect(ws).toBeDefined();
        expect(ws?.getCell("A1").value).toBe("Hello");
        expect(ws?.getCell("B1").value).toBe(42);
        expect(ws?.getCell("C1").value).toBe(true);
    });

    it("passes the number-format pattern through verbatim", async () => {
        const ws = (await roundTrip(
            singleCellWorkbook({ v: 1234.5, t: 2, s: "money" }, {}, { money: { n: { pattern: "#,##0.00;[Red]#,##0.00" } } })
        )).worksheets[0];
        expect(ws.getCell("A1").numFmt).toBe("#,##0.00;[Red]#,##0.00");
    });

    it("maps font: bold, italic, underline, strike, size, family and color", async () => {
        const ws = (await roundTrip(
            singleCellWorkbook({ v: "f", s: { bl: 1, it: 1, ul: { s: 1 }, st: { s: 1 }, fs: 14, ff: "Arial", cl: { rgb: "#414657" } } })
        )).worksheets[0];
        const font = ws.getCell("A1").font;
        expect(font.bold).toBe(true);
        expect(font.italic).toBe(true);
        expect(font.underline).toBe(true);
        expect(font.strike).toBe(true);
        expect(font.size).toBe(14);
        expect(font.name).toBe("Arial");
        expect(font.color?.argb).toBe("FF414657");
    });

    it("maps a background fill to a solid pattern fill", async () => {
        const ws = (await roundTrip(
            singleCellWorkbook({ v: "x", s: { bg: { rgb: "#f9f9f9" } } })
        )).worksheets[0];
        const fill = ws.getCell("A1").fill as ExcelJS.FillPattern;
        expect(fill.type).toBe("pattern");
        expect(fill.pattern).toBe("solid");
        expect(fill.fgColor?.argb).toBe("FFF9F9F9");
    });

    it("maps horizontal/vertical alignment and wrap", async () => {
        const ws = (await roundTrip(
            singleCellWorkbook({ v: "x", s: { ht: 3, vt: 2, tb: 3 } })
        )).worksheets[0];
        const a = ws.getCell("A1").alignment;
        expect(a.horizontal).toBe("right");
        expect(a.vertical).toBe("middle");
        expect(a.wrapText).toBe(true);
    });

    it("maps the Univer border enum to the correct exceljs styles and colors", async () => {
        // THIN=1, MEDIUM=8, THICK=13, DOTTED=3 (the codes the real template uses + thick).
        const ws = (await roundTrip(
            singleCellWorkbook({
                v: "b",
                s: {
                    bd: {
                        t: { s: 1, cl: { rgb: "#111111" } },
                        r: { s: 8, cl: { rgb: "#222222" } },
                        b: { s: 13, cl: { rgb: "#333333" } },
                        l: { s: 3, cl: { rgb: "#444444" } }
                    }
                }
            })
        )).worksheets[0];
        const border = ws.getCell("A1").border;
        expect(border.top?.style).toBe("thin");
        expect(border.top?.color?.argb).toBe("FF111111");
        expect(border.right?.style).toBe("medium");
        expect(border.bottom?.style).toBe("thick");
        expect(border.left?.style).toBe("dotted");
    });

    it("skips a NONE (0) border side", async () => {
        const ws = (await roundTrip(
            singleCellWorkbook({ v: "b", s: { bd: { t: { s: 0, cl: { rgb: "#111" } }, b: { s: 1, cl: { rgb: "#222222" } } } } })
        )).worksheets[0];
        const border = ws.getCell("A1").border;
        expect(border.top).toBeUndefined();
        expect(border.bottom?.style).toBe("thin");
    });

    it("applies merges", async () => {
        const ws = (await roundTrip(
            singleCellWorkbook({ v: "merged" }, { mergeData: [{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 }] })
        )).worksheets[0];
        expect(ws.getCell("A1").value).toBe("merged");
        expect(ws.getCell("B2").isMerged).toBe(true);
        expect(ws.getCell("B2").master.address).toBe("A1");
    });

    it("converts column width (px) and row height (px) to Excel units", async () => {
        const ws = (await roundTrip(
            singleCellWorkbook({ v: "x" }, { columnData: { "0": { w: 117 } }, rowData: { "0": { h: 40 } } })
        )).worksheets[0];
        // 117px -> (117-5)/7 = 16 chars; 40px -> 30pt.
        expect(ws.getColumn(1).width).toBeCloseTo(16, 1);
        expect(ws.getRow(1).height).toBeCloseTo(30, 1);
    });

    it("marks hidden rows and columns as hidden (data preserved)", async () => {
        const ws = (await roundTrip(
            singleCellWorkbook({ v: "x" }, { columnData: { "0": { hd: 1 } }, rowData: { "0": { hd: 1 } } })
        )).worksheets[0];
        expect(ws.getColumn(1).hidden).toBe(true);
        expect(ws.getRow(1).hidden).toBe(true);
    });

    it("reflects the showGridlines flag in the sheet view", async () => {
        const off = (await roundTrip(singleCellWorkbook({ v: "x" }, { showGridlines: 0 }))).worksheets[0];
        const on = (await roundTrip(singleCellWorkbook({ v: "x" }, { showGridlines: 1 }))).worksheets[0];
        expect(off.views[0].showGridLines).toBe(false);
        expect(on.views[0].showGridLines).toBe(true);
    });

    it("emits sheet default row height and column width", async () => {
        const ws = (await roundTrip(
            singleCellWorkbook({ v: "x" }, { defaultRowHeight: 24, defaultColumnWidth: 88 })
        )).worksheets[0];
        // 24px -> 18pt; 88px -> (88-5)/7 ≈ 11.86 chars.
        expect(ws.properties.defaultRowHeight).toBeCloseTo(18, 1);
        expect(ws.properties.defaultColWidth).toBeCloseTo(11.86, 1);
    });

    it("writes a formula with its cached result", async () => {
        const ws = (await roundTrip(singleCellWorkbook({ f: "=SUM(B1:B2)", v: 7, t: 2 }))).worksheets[0];
        const value = ws.getCell("A1").value as ExcelJS.CellFormulaValue;
        expect(value.formula).toBe("SUM(B1:B2)");
        expect(value.result).toBe(7);
    });

    it("skips hidden sheets but keeps a valid workbook", async () => {
        const json = JSON.stringify({
            version: 1,
            workbook: {
                sheetOrder: ["s1", "s2"],
                styles: {},
                sheets: {
                    s1: { id: "s1", name: "Visible", hidden: 0, mergeData: [], cellData: { "0": { "0": { v: "shown" } } }, rowData: {}, columnData: {} },
                    s2: { id: "s2", name: "Secret", hidden: 1, mergeData: [], cellData: { "0": { "0": { v: "hidden" } } }, rowData: {}, columnData: {} }
                }
            }
        });
        const wb = await roundTrip(json);
        expect(wb.worksheets.map((w) => w.name)).toEqual(["Visible"]);
    });

    it("resolves a style referenced by id", async () => {
        const ws = (await roundTrip(
            singleCellWorkbook({ v: "x", s: "bold" }, {}, { bold: { bl: 1 } })
        )).worksheets[0];
        expect(ws.getCell("A1").font.bold).toBe(true);
    });

    it("throws on unparseable JSON", async () => {
        await expect(renderSpreadsheetToXlsx("not json")).rejects.toThrow(/parse/i);
    });

    describe("output is a valid xlsx", () => {
        let buffer: ExcelJS.Buffer;
        beforeAll(async () => {
            buffer = await renderSpreadsheetToXlsx(singleCellWorkbook({ v: "x" }));
        });
        it("starts with the ZIP magic bytes (PK)", () => {
            const bytes = new Uint8Array(buffer as ArrayBuffer);
            expect(bytes[0]).toBe(0x50); // 'P'
            expect(bytes[1]).toBe(0x4b); // 'K'
        });
    });
});
