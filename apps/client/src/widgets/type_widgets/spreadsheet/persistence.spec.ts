import { IWorkbookData } from "@univerjs/presets";
import { describe, expect, it } from "vitest";

import { stripEmptyResources } from "./persistence";

function makeWorkbook(resources: IWorkbookData["resources"]): IWorkbookData {
    return { resources } as IWorkbookData;
}

describe("stripEmptyResources", () => {
    it("removes resources whose data is empty (\"\" or \"{}\") and keeps the rest", () => {
        const workbook = makeWorkbook([
            { name: "SHEET_RANGE_PROTECTION_PLUGIN", data: "" },
            { name: "SHEET_NOTE_PLUGIN", data: "{}" },
            { name: "SHEET_FILTER_PLUGIN", data: "{\"col\":1}" },
            { name: "SHEET_DEFINED_NAME_PLUGIN", data: "[]" }
        ]);

        const result = stripEmptyResources(workbook);

        expect(result.resources).toEqual([
            { name: "SHEET_FILTER_PLUGIN", data: "{\"col\":1}" },
            // "[]" is not one of the stripped sentinels, so it is preserved.
            { name: "SHEET_DEFINED_NAME_PLUGIN", data: "[]" }
        ]);
    });

    it("leaves an all-empty resource list as an empty array and is a no-op when resources is absent", () => {
        expect(stripEmptyResources(makeWorkbook([
            { name: "A", data: "" },
            { name: "B", data: "{}" }
        ])).resources).toEqual([]);

        const noResources = {} as IWorkbookData;
        expect(stripEmptyResources(noResources).resources).toBeUndefined();
    });
});
