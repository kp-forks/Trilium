import { describe, expect, it } from "vitest";

import { buildColumnDefinition, toAttributeName } from "./collection.js";
import type { RelationInfo } from "./collection.js";
import { isCollectionObject, isPage, parseObject } from "./importer.js";
import type { AnytypeBlock, AnytypeMark, AnytypeSnapshot } from "./importer.js";

/** Wraps blocks + details into the export's snapshot shape. Details accepts arbitrary relation-key entries
 * (property values are keyed by the relation's hex `relationKey`). */
function snapshot(
    blocks: AnytypeBlock[],
    details: { id?: string; name?: string; layout?: number; resolvedLayout?: number; createdDate?: number; lastModifiedDate?: number; links?: string[]; [key: string]: unknown },
    sbType = "Page"
): AnytypeSnapshot {
    return { sbType, snapshot: { data: { blocks, details } } };
}

/** Builds a relation map (relationKey → info) from `[key, name, format, includeTime?]` tuples. */
function relationMap(entries: [string, string, number, boolean?][]): Map<string, RelationInfo> {
    return new Map(entries.map(([key, name, format, includeTime]) => [key, { name, format, includeTime }]));
}

/** The local-time `YYYY-MM-DD[THH:mm]` an epoch (seconds) should format to — computed via native Date
 * getters so the assertion is timezone-independent (the importer uses dayjs local formatting). */
function localDate(epochSeconds: number, withTime = false): string {
    const d = new Date(epochSeconds * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return withTime ? `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

/** A text block with the given style (defaults to Paragraph), optional children and optional marks. */
function textBlock(id: string, text: string, style = "Paragraph", childrenIds: string[] = [], marks: AnytypeMark[] = []): AnytypeBlock {
    return { id, text: { text, style, marks: { marks } }, childrenIds };
}

/** A typical page: a root block pointing at the header chrome plus the given content block ids. */
function page(name: string, contentBlocks: AnytypeBlock[], layout = 0): AnytypeSnapshot {
    return snapshot(
        [
            { id: "obj", childrenIds: ["header", ...contentBlocks.map((b) => b.id)] },
            { id: "header", childrenIds: ["title"] },
            textBlock("title", "", "Title"),
            ...contentBlocks
        ],
        { id: "obj", name, layout }
    );
}

describe("collection properties", () => {
    // Supported formats: 0 text, 2 number, 3 select, 4 date/date-time, 6 checkbox, 7 url, 8 email, 9 phone, 11 multi-select.
    const rels = relationMap([
        ["6a3e29d5cafa6953a4661c15", "Text property", 0],
        ["6a3e29e1cafa6953a4661c16", "Number prop", 2],
        ["6a3e29e8cafa6953a4661c17", "Select property", 3], // single-select (option-backed)
        ["6a3e330acafa6953a4661c6b", "Date", 4, false], // date (no time)
        ["6a3e3317cafa6953a4661c6e", "Date & Time", 4, true], // date-time (includeTime)
        ["6a3e3354cafa6953a4661c73", "Checkbox", 6],
        ["6a3e335dcafa6953a4661c74", "URL", 7],
        ["6a3e336dcafa6953a4661c75", "Email", 8],
        ["6a3e337dcafa6953a4661c76", "Phone", 9],
        ["6a3e2a01cafa6953a4661c1c", "Multi-select", 11], // multi-select (option-backed)
        ["6a3e3323cafa6953a4661c6f", "File", 5] // an unsupported format (skipped for now)
    ]);

    // Maps a select/multi-select option id to its display name.
    const options = new Map<string, string>([
        ["opt-first-cap", "First"],
        ["opt-second-cap", "Second"],
        ["opt-first", "first"],
        ["opt-second", "second"]
    ]);

    describe("toAttributeName", () => {
        it("camel-cases a column name into a valid attribute name", () => {
            expect(toAttributeName("URL")).toBe("url");
            expect(toAttributeName("Text property")).toBe("textProperty");
            expect(toAttributeName("Number prop")).toBe("numberProp");
            expect(toAttributeName("Date & Time")).toBe("dateTime");
            expect(toAttributeName("   ")).toBe("unnamed");
        });
    });

    describe("buildColumnDefinition", () => {
        it("builds a single-valued promoted definition keeping the original name as the alias", () => {
            expect(buildColumnDefinition("url", "URL")).toBe("promoted,single,url,alias=URL");
            expect(buildColumnDefinition("text", "Text property")).toBe("promoted,single,text,alias=Text property");
        });

        it("neutralizes commas, equals and control chars in the alias so the definition can't be corrupted", () => {
            expect(buildColumnDefinition("text", "a,b=c")).toBe("promoted,single,text,alias=a b c");
        });

        it("emits the column's multiplicity (multi for a multi-select)", () => {
            expect(buildColumnDefinition("text", "Multi-select", "multi")).toBe("promoted,multi,text,alias=Multi-select");
        });
    });

    describe("parseObject — property values", () => {
        it("maps supported property values to labels, schemes email/phone with mailto:/tel:", () => {
            const details = {
                id: "obj",
                name: "Row",
                "6a3e29d5cafa6953a4661c15": "hello",
                "6a3e29e1cafa6953a4661c16": 42,
                "6a3e330acafa6953a4661c6b": 1782461197, // Date (epoch seconds) → date only
                "6a3e3317cafa6953a4661c6e": 1782461208, // Date & Time → datetime
                "6a3e3354cafa6953a4661c73": true, // Checkbox → boolean
                "6a3e335dcafa6953a4661c74": "https://triliumnotes.org",
                "6a3e336dcafa6953a4661c75": "contact@acme.com",
                "6a3e337dcafa6953a4661c76": "12345",
                "6a3e3323cafa6953a4661c6f": ["log"] // File — unsupported, skipped
            };
            const result = parseObject(snapshot([{ id: "obj", childrenIds: [] }], details), undefined, rels);
            expect(result.properties).toEqual([
                { name: "textProperty", value: "hello" },
                { name: "numberProp", value: "42" },
                { name: "date", value: localDate(1782461197) },
                { name: "dateTime", value: localDate(1782461208, true) },
                { name: "checkbox", value: "true" },
                { name: "url", value: "https://triliumnotes.org" },
                { name: "email", value: "mailto:contact@acme.com" },
                { name: "phone", value: "tel:12345" }
            ]);
        });

        it("renders a false checkbox as boolean false (an unset value, not present, contributes nothing)", () => {
            const details = { id: "obj", "6a3e3354cafa6953a4661c73": false };
            expect(parseObject(snapshot([{ id: "obj", childrenIds: [] }], details), undefined, rels).properties).toEqual([{ name: "checkbox", value: "false" }]);
        });

        it("resolves select / multi-select option ids to text labels (a multi-select yields one label per option)", () => {
            const details = {
                id: "obj",
                "6a3e29e8cafa6953a4661c17": ["opt-first-cap"], // Select → single value
                "6a3e2a01cafa6953a4661c1c": ["opt-first", "opt-second"] // Multi-select → two values
            };
            const result = parseObject(snapshot([{ id: "obj", childrenIds: [] }], details), undefined, rels, options);
            expect(result.properties).toEqual([
                { name: "selectProperty", value: "First" },
                { name: "multiSelect", value: "first" },
                { name: "multiSelect", value: "second" }
            ]);
        });

        it("drops select / multi-select options that can't be resolved to a name", () => {
            const details = { id: "obj", "6a3e2a01cafa6953a4661c1c": ["opt-first", "unknown-option"] };
            const result = parseObject(snapshot([{ id: "obj", childrenIds: [] }], details), undefined, rels, options);
            expect(result.properties).toEqual([{ name: "multiSelect", value: "first" }]);
        });

        it("collects a file property's values as file references, not labels", () => {
            const details = { id: "obj", "6a3e3323cafa6953a4661c6f": ["file-cid-1", "file-cid-2"] };
            const result = parseObject(snapshot([{ id: "obj", childrenIds: [] }], details), undefined, rels);
            // Files become attachments (resolved at import time), so they're surfaced separately, never as labels.
            expect(result.fileRefs).toEqual(["file-cid-1", "file-cid-2"]);
            expect(result.properties).toEqual([]);
        });

        it("ignores system relations (non-hex keys), unset values and an existing scheme", () => {
            const details = {
                id: "obj",
                name: "Named", // the title, not a property
                description: "a system longtext", // system relation, non-hex key → not a property
                "6a3e335dcafa6953a4661c74": "", // unset url → skipped
                "6a3e336dcafa6953a4661c75": "mailto:already@scheme.com" // keeps its existing scheme
            };
            const result = parseObject(snapshot([{ id: "obj", childrenIds: [] }], details), undefined, rels);
            expect(result.properties).toEqual([{ name: "email", value: "mailto:already@scheme.com" }]);
        });

        it("returns no properties when no relation map is supplied", () => {
            const details = { id: "obj", name: "Row", "6a3e335dcafa6953a4661c74": "https://x" };
            expect(parseObject(snapshot([{ id: "obj", childrenIds: [] }], details)).properties).toEqual([]);
        });
    });

    describe("isCollectionObject", () => {
        const collectionDoc = (resolvedLayout: number, isCollection: boolean) =>
            snapshot([{ id: "obj", childrenIds: ["dv"] }, { id: "dv", childrenIds: [], dataview: { isCollection } }], { id: "obj", name: "Coll", resolvedLayout });

        it("accepts a collection (a Page with an isCollection dataview) even though its layout isn't basic", () => {
            // A real collection carries the collection layout (14), so isPage rejects it — isCollectionObject must not.
            expect(isCollectionObject(collectionDoc(14, true))).toBe(true);
            expect(isPage(collectionDoc(14, true))).toBe(false);
        });

        it("rejects a query set (dataview without isCollection) and a plain page", () => {
            expect(isCollectionObject(collectionDoc(3, false))).toBe(false);
            expect(isCollectionObject(page("Plain", [textBlock("b1", "body")]))).toBe(false);
        });
    });

    describe("parseObject — collection", () => {
        it("parses members from links and visible supported columns in view order", () => {
            const dv: AnytypeBlock = {
                id: "dv",
                childrenIds: [],
                dataview: {
                    isCollection: true,
                    views: [
                        {
                            relations: [
                                { key: "6a3e335dcafa6953a4661c74", isVisible: true }, // URL → column
                                { key: "name", isVisible: true }, // system column (non-hex key) → excluded
                                { key: "6a3e3323cafa6953a4661c6f", isVisible: true }, // File (format 5) unsupported → excluded
                                { key: "6a3e336dcafa6953a4661c75", isVisible: false } // Email hidden → excluded
                            ]
                        }
                    ]
                }
            };
            const doc = snapshot([{ id: "obj", childrenIds: ["dv"] }, dv], { id: "obj", name: "My collection", links: ["m1", "m2"] });
            const result = parseObject(doc, undefined, rels);
            expect(result.collection).toEqual({
                memberIds: ["m1", "m2"],
                columns: [{ name: "url", labelType: "url", alias: "URL", multiplicity: "single" }]
            });
        });

        it("carries each column's multiplicity (multi for a multi-select)", () => {
            const dv: AnytypeBlock = {
                id: "dv",
                childrenIds: [],
                dataview: {
                    isCollection: true,
                    views: [{ relations: [{ key: "6a3e29e8cafa6953a4661c17", isVisible: true }, { key: "6a3e2a01cafa6953a4661c1c", isVisible: true }] }]
                }
            };
            const doc = snapshot([{ id: "obj", childrenIds: ["dv"] }, dv], { id: "obj", name: "C", links: [] });
            expect(parseObject(doc, undefined, rels).collection?.columns).toEqual([
                { name: "selectProperty", labelType: "text", alias: "Select property", multiplicity: "single" },
                { name: "multiSelect", labelType: "text", alias: "Multi-select", multiplicity: "multi" }
            ]);
        });

        it("leaves collection undefined for a regular (non-dataview) page", () => {
            expect(parseObject(page("Plain", [textBlock("b1", "body")]), undefined, rels).collection).toBeUndefined();
        });
    });
});
