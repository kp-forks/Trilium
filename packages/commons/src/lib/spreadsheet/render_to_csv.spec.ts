import { describe, expect, it } from "vitest";

import { renderSpreadsheetToCsv } from "./render_to_csv.js";

/** Build a workbook payload from a sparse cell matrix (keyed by row, then column). */
function workbook(
    cellData: Record<number, Record<number, unknown>>,
    sheetExtra: Record<string, unknown> = {},
    workbookExtra: Record<string, unknown> = {}
): string {
    return JSON.stringify({
        version: 1,
        workbook: {
            sheetOrder: ["s1"],
            styles: {},
            sheets: {
                s1: {
                    id: "s1",
                    name: "Sheet1",
                    hidden: 0,
                    mergeData: [],
                    cellData,
                    rowData: {},
                    columnData: {},
                    ...sheetExtra
                }
            },
            ...workbookExtra
        }
    });
}

describe("renderSpreadsheetToCsv", () => {
    it("lays cells out as a dense rectangle, filling gaps with empty fields", () => {
        const csv = renderSpreadsheetToCsv(workbook({
            0: { 0: { v: "a" }, 2: { v: "c" } },
            1: { 1: { v: "b" } }
        }));
        // Bounds span rows 0-1, cols 0-2; missing cells become empty fields.
        expect(csv).toBe("a,,c\r\n,b,");
    });

    it("offsets the grid to the populated bounds (no leading empty rows/cols)", () => {
        const csv = renderSpreadsheetToCsv(workbook({
            2: { 3: { v: "x" }, 4: { v: "y" } }
        }));
        expect(csv).toBe("x,y");
    });

    it("renders numbers and booleans as raw values", () => {
        const csv = renderSpreadsheetToCsv(workbook({
            0: { 0: { v: 42, t: 2 }, 1: { v: true, t: 3 }, 2: { v: false, t: 3 } }
        }));
        expect(csv).toBe("42,TRUE,FALSE");
    });

    it("exports a formula cell's cached result, not the formula", () => {
        const csv = renderSpreadsheetToCsv(workbook({
            0: { 0: { f: "=1+2", v: 3 } }
        }));
        expect(csv).toBe("3");
    });

    it("quotes fields containing commas, quotes, or newlines (RFC 4180)", () => {
        const csv = renderSpreadsheetToCsv(workbook({
            0: { 0: { v: "a,b" }, 1: { v: 'he said "hi"' }, 2: { v: "line1\nline2" } }
        }));
        expect(csv).toBe('"a,b","he said ""hi""","line1\nline2"');
    });

    it("treats empty and null cell values as empty fields", () => {
        const csv = renderSpreadsheetToCsv(workbook({
            0: { 0: { v: "" }, 1: { v: null }, 2: { v: "z" } }
        }));
        expect(csv).toBe(",,z");
    });

    it("exports the first visible sheet by default and the requested sheet by id", () => {
        const json = JSON.stringify({
            version: 1,
            workbook: {
                sheetOrder: ["s1", "s2"],
                styles: {},
                sheets: {
                    s1: { id: "s1", name: "First", hidden: 0, cellData: { 0: { 0: { v: "one" } } } },
                    s2: { id: "s2", name: "Second", hidden: 0, cellData: { 0: { 0: { v: "two" } } } }
                }
            }
        });
        expect(renderSpreadsheetToCsv(json)).toBe("one");
        expect(renderSpreadsheetToCsv(json, { sheetId: "s2" })).toBe("two");
        // Unknown id falls back to the first visible sheet.
        expect(renderSpreadsheetToCsv(json, { sheetId: "nope" })).toBe("one");
    });

    it("skips hidden sheets when choosing the default", () => {
        const json = JSON.stringify({
            version: 1,
            workbook: {
                sheetOrder: ["s1", "s2"],
                styles: {},
                sheets: {
                    s1: { id: "s1", name: "Hidden", hidden: 1, cellData: { 0: { 0: { v: "hidden" } } } },
                    s2: { id: "s2", name: "Visible", hidden: 0, cellData: { 0: { 0: { v: "visible" } } } }
                }
            }
        });
        expect(renderSpreadsheetToCsv(json)).toBe("visible");
    });

    it("returns an empty string for an empty sheet or a workbook with no visible sheets", () => {
        expect(renderSpreadsheetToCsv(workbook({}))).toBe("");

        const allHidden = JSON.stringify({
            version: 1,
            workbook: {
                sheetOrder: ["s1"],
                sheets: { s1: { id: "s1", name: "H", hidden: 1, cellData: {} } }
            }
        });
        expect(renderSpreadsheetToCsv(allHidden)).toBe("");
    });

    it("throws on unparseable JSON and on a workbook with no sheets", () => {
        expect(() => renderSpreadsheetToCsv("not json")).toThrow(/parse/i);
        expect(() => renderSpreadsheetToCsv(JSON.stringify({ version: 1 }))).toThrow(/no sheets/i);
    });
});
