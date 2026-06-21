import { IWorkbookData, LocaleType } from "@univerjs/presets";
import { describe, expect, it } from "vitest";

import { slimWorkbookData } from "./persistence";

function makeWorkbook(workbook: Partial<IWorkbookData>): IWorkbookData {
    return workbook as IWorkbookData;
}

describe("slimWorkbookData", () => {
    it("drops the top-level workbook id and locale (both reassigned on load)", () => {
        const result = slimWorkbookData(makeWorkbook({ id: "abc123", locale: LocaleType.ZH_CN, name: "Sheet" }));

        expect(result.id).toBeUndefined();
        expect(result.locale).toBeUndefined();
        expect(result.name).toBe("Sheet");
    });

    it("removes resources whose data is empty (\"\" or \"{}\") and keeps the rest", () => {
        const result = slimWorkbookData(makeWorkbook({
            resources: [
                { name: "SHEET_RANGE_PROTECTION_PLUGIN", data: "" },
                { name: "SHEET_NOTE_PLUGIN", data: "{}" },
                { name: "SHEET_FILTER_PLUGIN", data: "{\"col\":1}" },
                // "[]" is not one of the stripped sentinels, so it is preserved.
                { name: "SHEET_DEFINED_NAME_PLUGIN", data: "[]" }
            ]
        }));

        expect(result.resources).toEqual([
            { name: "SHEET_FILTER_PLUGIN", data: "{\"col\":1}" },
            { name: "SHEET_DEFINED_NAME_PLUGIN", data: "[]" }
        ]);
    });

    it("keeps the drawing resource carrying an inline base64 image, but drops it when empty", () => {
        // Images are stored as base64 inside the SHEET_DRAWING_PLUGIN resource, so slimming must
        // preserve a populated drawing resource (otherwise inserted images would vanish on save)
        // while still discarding the empty "{}" the plugin emits for a sheet with no drawings.
        const drawingData = "{\"sheet1\":{\"data\":{\"img1\":{\"source\":\"data:image/png;base64,iVBORw0KGgo=\"}}}}";
        const result = slimWorkbookData(makeWorkbook({
            resources: [
                { name: "SHEET_DRAWING_PLUGIN", data: drawingData },
                { name: "SHEET_NOTE_PLUGIN", data: "{}" }
            ]
        }));

        expect(result.resources).toEqual([
            { name: "SHEET_DRAWING_PLUGIN", data: drawingData }
        ]);
    });

    it("leaves an all-empty resource list as an empty array and tolerates absent resources", () => {
        expect(slimWorkbookData(makeWorkbook({
            resources: [
                { name: "A", data: "" },
                { name: "B", data: "{}" }
            ]
        })).resources).toEqual([]);

        expect(slimWorkbookData(makeWorkbook({})).resources).toBeUndefined();
    });
});
