/**
 * Converts a UniversJS workbook JSON structure into an `.xlsx` file (OOXML).
 *
 * Unlike the HTML renderer, this is a near-lossless mapping: Univer's cell model mirrors
 * OOXML, so number formats pass through verbatim, the border-style enum maps almost 1:1 to
 * Excel's, and fonts/fills/alignment/merges map directly. The heavy lifting (zip + XML) is
 * delegated to `exceljs`.
 *
 * DRAFT: the workbook-reading type subset and the `BorderStyle` enum are duplicated from
 * `render_to_html.ts` for now. Once a second consumer lands, lift the shared reader (parse,
 * sheet selection, style resolution, the type subset) into its own module and have both the
 * HTML and XLSX emitters depend on it.
 */

import ExcelJS from "exceljs";

// #region UniversJS type subset

interface PersistedData {
    version: number;
    workbook: IWorkbookData;
}

interface IWorkbookData {
    sheetOrder: string[];
    name?: string;
    styles?: Record<string, IStyleData | null>;
    sheets: Record<string, IWorksheetData>;
}

interface IWorksheetData {
    id: string;
    name: string;
    hidden?: number;
    defaultColumnWidth?: number;
    defaultRowHeight?: number;
    mergeData?: IRange[];
    cellData: CellMatrix;
    rowData?: Record<number, IRowData>;
    columnData?: Record<number, IColumnData>;
    showGridlines?: number;
}

type CellMatrix = Record<number, Record<number, ICellData>>;

interface ICellData {
    v?: string | number | boolean | null;
    t?: number | null;
    s?: IStyleData | string | null;
    f?: string | null;
}

interface IStyleData {
    bl?: number;
    it?: number;
    ul?: ITextDecoration;
    st?: ITextDecoration;
    fs?: number;
    ff?: string | null;
    bg?: IColorStyle | null;
    cl?: IColorStyle | null;
    ht?: number | null;
    vt?: number | null;
    tb?: number | null;
    tr?: ITextRotation | null;
    bd?: IBorderData | null;
    n?: { pattern?: string | null } | null;
}

interface ITextDecoration {
    s?: number;
}

interface IColorStyle {
    rgb?: string | null;
}

interface ITextRotation {
    a?: number;
    v?: number;
}

interface IBorderData {
    t?: IBorderStyleData | null;
    r?: IBorderStyleData | null;
    b?: IBorderStyleData | null;
    l?: IBorderStyleData | null;
}

interface IBorderStyleData {
    s?: number;
    cl?: IColorStyle;
}

interface IRange {
    startRow: number;
    endRow: number;
    startColumn: number;
    endColumn: number;
}

interface IRowData {
    h?: number;
    hd?: number;
}

interface IColumnData {
    w?: number;
    hd?: number;
}

const enum HorizontalAlign {
    LEFT = 1,
    CENTER = 2,
    RIGHT = 3
}

const enum VerticalAlign {
    TOP = 1,
    MIDDLE = 2,
    BOTTOM = 3
}

const enum WrapStrategy {
    WRAP = 3
}

// Univer BorderStyleTypes (@univerjs/core) -> exceljs border styles (OOXML names).
const enum BorderStyle {
    NONE = 0,
    THIN = 1,
    HAIR = 2,
    DOTTED = 3,
    DASHED = 4,
    DASH_DOT = 5,
    DASH_DOT_DOT = 6,
    DOUBLE = 7,
    MEDIUM = 8,
    MEDIUM_DASHED = 9,
    MEDIUM_DASH_DOT = 10,
    MEDIUM_DASH_DOT_DOT = 11,
    SLANT_DASH_DOT = 12,
    THICK = 13
}

// #endregion

/**
 * Parses the raw JSON content of a spreadsheet note and produces an `.xlsx` workbook as a
 * binary buffer. Hidden sheets are skipped; hidden rows/columns are preserved but flagged
 * hidden (Excel keeps the data). Throws if the content is not a parseable workbook.
 */
export async function renderSpreadsheetToXlsx(jsonContent: string): Promise<ExcelJS.Buffer> {
    let data: PersistedData;
    try {
        data = JSON.parse(jsonContent);
    } catch {
        throw new Error("Unable to parse spreadsheet data.");
    }

    if (!data?.workbook?.sheets) {
        throw new Error("Spreadsheet contains no sheets.");
    }

    const { workbook } = data;
    const styles = workbook.styles ?? {};
    const out = new ExcelJS.Workbook();

    const sheetIds = workbook.sheetOrder ?? Object.keys(workbook.sheets);
    const visibleSheets = sheetIds
        .map((id) => workbook.sheets[id])
        .filter((s) => s && !s.hidden);

    // Always emit at least one sheet so the file is a valid workbook.
    if (visibleSheets.length === 0) {
        out.addWorksheet("Sheet1");
        return out.xlsx.writeBuffer();
    }

    for (const sheet of visibleSheets) {
        writeSheet(out, sheet, styles);
    }

    return out.xlsx.writeBuffer();
}

function writeSheet(out: ExcelJS.Workbook, sheet: IWorksheetData, styles: Record<string, IStyleData | null>): void {
    const ws = out.addWorksheet(sheet.name || "Sheet", {
        views: [{ showGridLines: sheet.showGridlines !== 0 }]
    });

    applyColumns(ws, sheet);
    applyRows(ws, sheet);

    const { cellData } = sheet;
    for (const rowStr of Object.keys(cellData)) {
        const row = Number(rowStr);
        const cols = cellData[row];
        for (const colStr of Object.keys(cols)) {
            const col = Number(colStr);
            writeCell(ws.getCell(row + 1, col + 1), cols[col], styles);
        }
    }

    for (const range of sheet.mergeData ?? []) {
        try {
            // exceljs uses 1-based, inclusive (top, left, bottom, right).
            ws.mergeCells(range.startRow + 1, range.startColumn + 1, range.endRow + 1, range.endColumn + 1);
        } catch {
            // Overlapping/invalid merge — skip rather than abort the whole export.
        }
    }
}

function applyColumns(ws: ExcelJS.Worksheet, sheet: IWorksheetData): void {
    const columnData = sheet.columnData ?? {};
    for (const colStr of Object.keys(columnData)) {
        const meta = columnData[Number(colStr)];
        const column = ws.getColumn(Number(colStr) + 1);
        if (isFiniteNumber(meta?.w)) column.width = pxToExcelWidth(meta.w);
        if (meta?.hd) column.hidden = true;
    }
}

function applyRows(ws: ExcelJS.Worksheet, sheet: IWorksheetData): void {
    const rowData = sheet.rowData ?? {};
    for (const rowStr of Object.keys(rowData)) {
        const meta = rowData[Number(rowStr)];
        const row = ws.getRow(Number(rowStr) + 1);
        if (isFiniteNumber(meta?.h)) row.height = pxToPoints(meta.h);
        if (meta?.hd) row.hidden = true;
    }
}

function writeCell(target: ExcelJS.Cell, cell: ICellData | undefined, styles: Record<string, IStyleData | null>): void {
    if (!cell) return;

    setCellValue(target, cell);

    const style = resolveStyle(cell.s, styles);
    if (!style) return;

    if (style.n?.pattern) target.numFmt = style.n.pattern;

    const font = buildFont(style);
    if (font) target.font = font;

    const fill = buildFill(style);
    if (fill) target.fill = fill;

    const alignment = buildAlignment(style);
    if (alignment) target.alignment = alignment;

    const border = buildBorder(style.bd);
    if (border) target.border = border;
}

function setCellValue(target: ExcelJS.Cell, cell: ICellData): void {
    if (cell.f) {
        // Univer stores formulas with a leading "="; exceljs wants it stripped, plus the
        // cached result so the value shows without a recalc.
        target.value = { formula: cell.f.replace(/^=/, ""), result: cell.v ?? undefined } as ExcelJS.CellFormulaValue;
        return;
    }
    if (cell.v == null) return;
    target.value = cell.v;
}

function resolveStyle(s: ICellData["s"], styles: Record<string, IStyleData | null>): IStyleData | null {
    if (!s) return null;
    if (typeof s === "string") return styles[s] ?? null;
    return s;
}

function buildFont(style: IStyleData): Partial<ExcelJS.Font> | null {
    const font: Partial<ExcelJS.Font> = {};
    let any = false;

    if (style.ff) { font.name = style.ff; any = true; }
    if (isFiniteNumber(style.fs)) { font.size = style.fs; any = true; }
    if (style.bl) { font.bold = true; any = true; }
    if (style.it) { font.italic = true; any = true; }
    if (style.ul?.s) { font.underline = true; any = true; }
    if (style.st?.s) { font.strike = true; any = true; }

    const color = toArgb(style.cl?.rgb);
    if (color) { font.color = { argb: color }; any = true; }

    return any ? font : null;
}

function buildFill(style: IStyleData): ExcelJS.Fill | null {
    const argb = toArgb(style.bg?.rgb);
    if (!argb) return null;
    return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function buildAlignment(style: IStyleData): Partial<ExcelJS.Alignment> | null {
    const alignment: Partial<ExcelJS.Alignment> = {};
    let any = false;

    const horizontal = horizontalAlign(style.ht);
    if (horizontal) { alignment.horizontal = horizontal; any = true; }

    const vertical = verticalAlign(style.vt);
    if (vertical) { alignment.vertical = vertical; any = true; }

    if (style.tb === WrapStrategy.WRAP) { alignment.wrapText = true; any = true; }

    if (style.tr) {
        if (style.tr.v) { alignment.textRotation = "vertical"; any = true; }
        else if (isFiniteNumber(style.tr.a) && style.tr.a !== 0) { alignment.textRotation = style.tr.a; any = true; }
    }

    return any ? alignment : null;
}

function buildBorder(bd: IBorderData | null | undefined): Partial<ExcelJS.Borders> | null {
    if (!bd) return null;
    const border: Partial<ExcelJS.Borders> = {};
    let any = false;

    for (const [univerSide, excelSide] of [["t", "top"], ["r", "right"], ["b", "bottom"], ["l", "left"]] as const) {
        const side = bd[univerSide];
        const style = borderStyle(side?.s);
        if (!style) continue;
        border[excelSide] = { style, color: { argb: toArgb(side?.cl?.rgb) ?? "FF000000" } };
        any = true;
    }

    return any ? border : null;
}

function horizontalAlign(ht: number | null | undefined): ExcelJS.Alignment["horizontal"] | null {
    switch (ht) {
        case HorizontalAlign.LEFT: return "left";
        case HorizontalAlign.CENTER: return "center";
        case HorizontalAlign.RIGHT: return "right";
        default: return null;
    }
}

function verticalAlign(vt: number | null | undefined): ExcelJS.Alignment["vertical"] | null {
    switch (vt) {
        case VerticalAlign.TOP: return "top";
        case VerticalAlign.MIDDLE: return "middle";
        case VerticalAlign.BOTTOM: return "bottom";
        default: return null;
    }
}

function borderStyle(s: number | undefined): ExcelJS.BorderStyle | null {
    switch (s) {
        case BorderStyle.THIN: return "thin";
        case BorderStyle.HAIR: return "hair";
        case BorderStyle.DOTTED: return "dotted";
        case BorderStyle.DASHED: return "dashed";
        case BorderStyle.DASH_DOT: return "dashDot";
        case BorderStyle.DASH_DOT_DOT: return "dashDotDot";
        case BorderStyle.DOUBLE: return "double";
        case BorderStyle.MEDIUM: return "medium";
        case BorderStyle.MEDIUM_DASHED: return "mediumDashed";
        case BorderStyle.MEDIUM_DASH_DOT: return "mediumDashDot";
        case BorderStyle.MEDIUM_DASH_DOT_DOT: return "mediumDashDotDot";
        case BorderStyle.SLANT_DASH_DOT: return "slantDashDot";
        case BorderStyle.THICK: return "thick";
        default: return null; // NONE / unknown -> no border
    }
}

/** Converts a `#rrggbb` (or `#rrggbbaa`) color to exceljs' `AARRGGBB`. Returns null otherwise. */
function toArgb(rgb: string | null | undefined): string | null {
    if (!rgb) return null;
    const hex = rgb.trim().replace(/^#/, "").toUpperCase();
    if (/^[0-9A-F]{6}$/.test(hex)) return `FF${hex}`;
    if (/^[0-9A-F]{8}$/.test(hex)) return hex; // already AARRGGBB
    return null;
}

/** Univer stores column widths in pixels; Excel uses character widths (default-font based). */
function pxToExcelWidth(px: number): number {
    // Excel's width unit is "max digit widths"; ~7px per char + 5px cell padding for the default font.
    return Math.max(0, (px - 5) / 7);
}

/** Univer stores row heights in pixels; Excel uses points (1px = 0.75pt at 96dpi). */
function pxToPoints(px: number): number {
    return px * 0.75;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v);
}
