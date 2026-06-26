import { describe, expect, it } from "vitest";

import { anytypeDate, buildColumnDefinition, isCollectionObject, isPage, parseObject, renderCodeBlock, renderInlineText, toAttributeName } from "./importer.js";
import type { AnytypeBlock, AnytypeMark, AnytypeSnapshot, LinkResolver, RelationInfo } from "./importer.js";

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

/** An inline mark over a `[from, to)` range. */
function mark(from: number, to: number, type: string, param?: string): AnytypeMark {
    return { range: { from, to }, type, param };
}

/** A list item (Marked/Numbered/Checkbox) with optional nested children, checked state and marks. */
function listItem(id: string, style: string, text: string, childrenIds: string[] = [], checked = false, marks: AnytypeMark[] = []): AnytypeBlock {
    return { id, text: { text, style, marks: { marks }, checked }, childrenIds };
}

/** A page whose root's direct children are `rootChildIds`; `blocks` supplies those plus any nested blocks. */
function listDoc(rootChildIds: string[], blocks: AnytypeBlock[]): AnytypeSnapshot {
    return snapshot([{ id: "obj", childrenIds: rootChildIds }, ...blocks], { id: "obj", name: "List" });
}

describe("isPage", () => {
    it("accepts a basic-layout Page and rejects sets and system objects", () => {
        expect(isPage(page("A page", []))).toBe(true);
        // A set/collection is also sbType Page but layout 3.
        expect(isPage(page("A set", [], 3))).toBe(false);
        // Non-page smartblocks (participant, workspace, …) are excluded regardless of layout.
        expect(isPage(snapshot([], { id: "p", name: "Someone", layout: 19 }, "Participant"))).toBe(false);
        expect(isPage(snapshot([], { id: "w", layout: 10 }, "Workspace"))).toBe(false);
    });

    it("accepts a basic page that omits `layout` (single-object exports), falling back to resolvedLayout", () => {
        // Anytype drops `layout` when it's the default, carrying the value in resolvedLayout instead.
        expect(isPage(snapshot([], { id: "p", name: "Solo page", resolvedLayout: 0 }))).toBe(true);
        // With neither field present, a Page still defaults to basic.
        expect(isPage(snapshot([], { id: "p", name: "Bare page" }))).toBe(true);
        // resolvedLayout still excludes a set whose `layout` is likewise omitted.
        expect(isPage(snapshot([], { id: "s", name: "Solo set", resolvedLayout: 3 }))).toBe(false);
    });
});

describe("parseObject", () => {
    it("takes the title from details.name and falls back to a paragraph for an unrecognised style", () => {
        // Paragraph and any style we don't specially handle render as a plain <p>.
        const result = parseObject(page("My Page", [textBlock("b1", "First"), textBlock("b2", "Second", "FutureStyle")]));
        expect(result.id).toBe("obj");
        expect(result.title).toBe("My Page");
        expect(result.content).toBe("<p>First</p><p>Second</p>");
    });

    it("maps Anytype's three heading styles to Trilium's top heading levels (h2/h3/h4)", () => {
        // Labels and order taken from the "Formatting test" page: Header1/2/3 are Title/Heading/Subheading.
        const result = parseObject(
            page("Headings", [
                textBlock("b1", "Regular text", "Paragraph"),
                textBlock("b2", "Title", "Header1"),
                textBlock("b3", "Heading", "Header2"),
                textBlock("b4", "Subheading", "Header3")
            ])
        );
        expect(result.content).toBe("<p>Regular text</p><h2>Title</h2><h3>Heading</h3><h4>Subheading</h4>");
    });

    it("applies inline marks inside the block's tag", () => {
        const result = parseObject(page("Marks", [textBlock("b1", "Bold text", "Paragraph", [], [mark(0, 4, "Bold")])]));
        expect(result.content).toBe("<p><strong>Bold</strong> text</p>");
    });

    it("renders a Code-style block as a code block, preserving the language from fields.lang", () => {
        const codeBlock: AnytypeBlock = { id: "b1", text: { text: "int x;", style: "Code" }, fields: { lang: "clike" }, childrenIds: [] };
        const result = parseObject(page("Code", [codeBlock]));
        expect(result.content).toBe('<pre><code class="language-text-x-csrc">int x;</code></pre>');
    });

    it("walks nested blocks in document order (parent text before its children)", () => {
        const result = parseObject(page("Nested", [textBlock("b1", "Parent", "Paragraph", ["c1"]), textBlock("c1", "Child")]));
        expect(result.content).toBe("<p>Parent</p><p>Child</p>");
    });

    it("skips the header subtree and empty / non-text blocks", () => {
        const result = parseObject(
            page("Mixed", [
                textBlock("b1", "   "), // whitespace only
                { id: "b2", childrenIds: [] }, // a non-text block (e.g. a link/divider) carries no text
                textBlock("b3", "Real content")
            ])
        );
        expect(result.content).toBe("<p>Real content</p>");
    });

    it("falls back to 'Untitled' when the page has no name", () => {
        expect(parseObject(page("", [textBlock("b1", "body")])).title).toBe("Untitled");
        expect(parseObject(page("   ", [])).title).toBe("Untitled");
    });
});

describe("lists", () => {
    it("groups consecutive Marked items into one <ul>", () => {
        const doc = listDoc(["m1", "m2"], [listItem("m1", "Marked", "One"), listItem("m2", "Marked", "Two")]);
        expect(parseObject(doc).content).toBe("<ul><li>One</li><li>Two</li></ul>");
    });

    it("renders Numbered items as an <ol>", () => {
        const doc = listDoc(["n1", "n2"], [listItem("n1", "Numbered", "One"), listItem("n2", "Numbered", "Two")]);
        expect(parseObject(doc).content).toBe("<ol><li>One</li><li>Two</li></ol>");
    });

    it("renders Checkbox items as a CKEditor todo-list carrying the checked state", () => {
        const doc = listDoc(["c1", "c2"], [listItem("c1", "Checkbox", "Todo", [], false), listItem("c2", "Checkbox", "Done", [], true)]);
        expect(parseObject(doc).content).toBe(
            '<ul class="todo-list">' +
                '<li><label class="todo-list__label"><input type="checkbox"disabled="disabled"><span class="todo-list__label__description">Todo</span></label></li>' +
                '<li><label class="todo-list__label"><input type="checkbox"checked="checked" disabled="disabled"><span class="todo-list__label__description">Done</span></label></li>' +
                "</ul>"
        );
    });

    it("nests child list items inside the parent <li>", () => {
        const doc = listDoc(
            ["m1", "m2"],
            [listItem("m1", "Marked", "One", ["m1a"]), listItem("m1a", "Marked", "One-A"), listItem("m2", "Marked", "Two")]
        );
        expect(parseObject(doc).content).toBe("<ul><li>One<ul><li>One-A</li></ul></li><li>Two</li></ul>");
    });

    it("starts a new list when the type changes or a non-list block interrupts", () => {
        const doc = listDoc(
            ["m1", "n1", "p1", "m2"],
            [
                listItem("m1", "Marked", "Bullet"),
                listItem("n1", "Numbered", "Number"),
                { id: "p1", text: { text: "Para", style: "Paragraph", marks: { marks: [] } } },
                listItem("m2", "Marked", "Again")
            ]
        );
        expect(parseObject(doc).content).toBe("<ul><li>Bullet</li></ul><ol><li>Number</li></ol><p>Para</p><ul><li>Again</li></ul>");
    });

    it("applies inline marks inside list items", () => {
        const doc = listDoc(["m1"], [listItem("m1", "Marked", "Bold item", [], false, [mark(0, 4, "Bold")])]);
        expect(parseObject(doc).content).toBe("<ul><li><strong>Bold</strong> item</li></ul>");
    });
});

describe("quotes", () => {
    it("converts a Quote (Anytype's Highlight block) to a blockquote", () => {
        const doc = listDoc(["q1"], [{ id: "q1", text: { text: "A quote", style: "Quote", marks: { marks: [] } } }]);
        expect(parseObject(doc).content).toBe("<blockquote><p>A quote</p></blockquote>");
    });

    it("applies inline marks and renders child blocks inside the blockquote", () => {
        const doc = listDoc(
            ["q1"],
            [
                { id: "q1", text: { text: "Bold quote", style: "Quote", marks: { marks: [mark(0, 4, "Bold")] } }, childrenIds: ["q1a"] },
                { id: "q1a", text: { text: "More", style: "Paragraph", marks: { marks: [] } } }
            ]
        );
        expect(parseObject(doc).content).toBe("<blockquote><p><strong>Bold</strong> quote</p><p>More</p></blockquote>");
    });
});

describe("callouts", () => {
    it("converts a default-icon callout to a tip admonition (icon implied, dropped)", () => {
        const doc = listDoc(["c1"], [{ id: "c1", text: { text: "Heads up", style: "Callout", marks: { marks: [] }, iconEmoji: "" } }]);
        expect(parseObject(doc).content).toBe('<aside class="admonition tip"><p>Heads up</p></aside>');
    });

    it("converts a custom-emoji callout to a note admonition, keeping the emoji at the start", () => {
        const doc = listDoc(["c1"], [{ id: "c1", text: { text: "Foggy", style: "Callout", marks: { marks: [] }, iconEmoji: "😶‍🌫️" } }]);
        expect(parseObject(doc).content).toBe('<aside class="admonition note"><p>😶‍🌫️ Foggy</p></aside>');
    });

    it("applies inline marks in the callout body and renders child blocks inside the aside", () => {
        const doc = listDoc(
            ["c1"],
            [
                { id: "c1", text: { text: "Bold note", style: "Callout", marks: { marks: [mark(0, 4, "Bold")] }, iconEmoji: "" }, childrenIds: ["c1a"] },
                { id: "c1a", text: { text: "More", style: "Paragraph", marks: { marks: [] } } }
            ]
        );
        expect(parseObject(doc).content).toBe('<aside class="admonition tip"><p><strong>Bold</strong> note</p><p>More</p></aside>');
    });
});

describe("dividers", () => {
    it("converts Line and Dots divider blocks to <hr>", () => {
        const doc = listDoc(
            ["p1", "d1", "d2", "p2"],
            [
                { id: "p1", text: { text: "Above", style: "Paragraph", marks: { marks: [] } } },
                { id: "d1", div: { style: "Line" } },
                { id: "d2", div: { style: "Dots" } },
                { id: "p2", text: { text: "Below", style: "Paragraph", marks: { marks: [] } } }
            ]
        );
        expect(parseObject(doc).content).toBe("<p>Above</p><hr><hr><p>Below</p>");
    });
});

describe("toggles", () => {
    it("converts a Toggle to a collapsible block, nesting its children as the collapsed body", () => {
        const doc = listDoc(
            ["t1", "p1"],
            [
                { id: "t1", text: { text: "Summary", style: "Toggle", marks: { marks: [mark(0, 7, "Bold")] } }, childrenIds: ["t1a"] },
                { id: "t1a", text: { text: "Hidden", style: "Paragraph", marks: { marks: [] } } },
                { id: "p1", text: { text: "After", style: "Paragraph", marks: { marks: [] } } }
            ]
        );
        expect(parseObject(doc).content).toBe(
            '<details class="trilium-collapsible"><summary><strong>Summary</strong></summary><p>Hidden</p></details><p>After</p>'
        );
    });

    it("converts toggle headings to normal headings (h2/h3/h4), keeping their content", () => {
        const doc = listDoc(
            ["th1", "th2", "th3"],
            [
                { id: "th1", text: { text: "T1", style: "ToggleHeader1", marks: { marks: [] } }, childrenIds: ["th1a"] },
                { id: "th1a", text: { text: "Body", style: "Paragraph", marks: { marks: [] } } },
                { id: "th2", text: { text: "T2", style: "ToggleHeader2", marks: { marks: [] } } },
                { id: "th3", text: { text: "T3", style: "ToggleHeader3", marks: { marks: [] } } }
            ]
        );
        expect(parseObject(doc).content).toBe("<h2>T1</h2><p>Body</p><h3>T2</h3><h4>T3</h4>");
    });
});

describe("links", () => {
    /** A block-level "link to object" pointing at the target object's id (CID). */
    const linkBlock = (id: string, targetCid: string): AnytypeBlock => ({ id, link: { targetBlockId: targetCid, style: "Page" }, childrenIds: [] });

    it("renders a link to an imported page as a reference link and records the resolved target", () => {
        const doc = listDoc(["l1"], [linkBlock("l1", "target-cid")]);
        const resolve: LinkResolver = (cid) => (cid === "target-cid" ? { noteId: "noteB", title: "Target Page" } : undefined);

        const result = parseObject(doc, resolve);
        expect(result.content).toBe('<p><a class="reference-link" href="#root/noteB">Target Page</a></p>');
        // The resolved target id is surfaced so the importer can create the internalLink relation.
        expect(result.linkTargetIds).toEqual(["noteB"]);
    });

    it("drops a link whose target wasn't imported (a set, or an object missing from the export)", () => {
        const doc = listDoc(["l1"], [linkBlock("l1", "missing-cid")]);

        const result = parseObject(doc, () => undefined);
        expect(result.content).toBe("");
        expect(result.linkTargetIds).toEqual([]);
    });

    it("escapes the target title and de-duplicates repeated links to the same page", () => {
        const doc = listDoc(["l1", "l2"], [linkBlock("l1", "t"), linkBlock("l2", "t")]);
        const resolve: LinkResolver = () => ({ noteId: "n", title: "A & B <x>" });

        const result = parseObject(doc, resolve);
        expect(result.content).toBe(
            '<p><a class="reference-link" href="#root/n">A &amp; B &lt;x&gt;</a></p>' +
                '<p><a class="reference-link" href="#root/n">A &amp; B &lt;x&gt;</a></p>'
        );
        // Both links point at the same note, so only one relation should be recorded.
        expect(result.linkTargetIds).toEqual(["n"]);
    });

    it("ignores link blocks when no resolver is supplied (parsing a page in isolation)", () => {
        const doc = listDoc(["p1", "l1"], [{ id: "p1", text: { text: "Body", style: "Paragraph", marks: { marks: [] } } }, linkBlock("l1", "t")]);

        const result = parseObject(doc);
        expect(result.content).toBe("<p>Body</p>");
        expect(result.linkTargetIds).toEqual([]);
    });
});

describe("dates", () => {
    it("converts an Anytype detail timestamp (Unix seconds) to a Trilium UTC datetime string", () => {
        // Verbatim createdDate from the "Article 6 Electronic Contracts" page.
        expect(anytypeDate(1735632037)).toBe("2024-12-31 08:00:37.000Z");
    });

    it("treats a missing or non-positive timestamp as absent (system objects export 0)", () => {
        expect(anytypeDate(undefined)).toBeUndefined();
        expect(anytypeDate(0)).toBeUndefined();
        expect(anytypeDate(-5)).toBeUndefined();
        expect(anytypeDate(Number.NaN)).toBeUndefined();
    });

    it("carries a page's created and modified dates through parseObject", () => {
        const doc = snapshot([{ id: "obj", childrenIds: [] }], { id: "obj", name: "Dated", createdDate: 1735632037, lastModifiedDate: 1735632353 });
        const result = parseObject(doc);
        expect(result.dateCreated).toBe("2024-12-31 08:00:37.000Z");
        expect(result.dateModified).toBe("2024-12-31 08:05:53.000Z");
    });

    it("leaves both dates undefined when the page carries none", () => {
        const result = parseObject(page("Undated", [textBlock("b1", "body")]));
        expect(result.dateCreated).toBeUndefined();
        expect(result.dateModified).toBeUndefined();
    });
});

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

describe("renderInlineText", () => {
    it("returns escaped plain text when there are no marks", () => {
        expect(renderInlineText("a < b & c > d", [])).toBe("a &lt; b &amp; c &gt; d");
    });

    it("wraps a single mark's range, leaving the rest untouched", () => {
        expect(renderInlineText("Bold text", [mark(0, 4, "Bold")])).toBe("<strong>Bold</strong> text");
    });

    it("maps the five supported marks to their tags ([from, to) range)", () => {
        expect(renderInlineText("x", [mark(0, 1, "Bold")])).toBe("<strong>x</strong>");
        expect(renderInlineText("x", [mark(0, 1, "Italic")])).toBe("<em>x</em>");
        expect(renderInlineText("x", [mark(0, 1, "Strikethrough")])).toBe("<s>x</s>");
        expect(renderInlineText("x", [mark(0, 1, "Underscored")])).toBe("<u>x</u>");
        expect(renderInlineText("x", [mark(0, 1, "Keyboard")])).toBe("<code>x</code>");
    });

    it("renders the real 'Formatting test' line, nesting coincident bold+italic+underline", () => {
        // Verbatim text and marks from the exported page (marks intentionally unsorted, as in the export).
        const text = "Bold Italic Strikethrough Underline Bold Italic Underline";
        const marks = [
            mark(12, 25, "Strikethrough"),
            mark(5, 11, "Italic"),
            mark(36, 57, "Italic"),
            mark(0, 4, "Bold"),
            mark(36, 57, "Bold"),
            mark(26, 35, "Underscored"),
            mark(36, 57, "Underscored")
        ];
        expect(renderInlineText(text, marks)).toBe(
            "<strong>Bold</strong> <em>Italic</em> <s>Strikethrough</s> <u>Underline</u> <strong><em><u>Bold Italic Underline</u></em></strong>"
        );
    });

    it("splits partially overlapping marks into properly nested segments", () => {
        // Bold [0,4) and Italic [2,6) overlap only on [2,4).
        expect(renderInlineText("abcdef", [mark(0, 4, "Bold"), mark(2, 6, "Italic")])).toBe(
            "<strong>ab</strong><strong><em>cd</em></strong><em>ef</em>"
        );
    });

    it("maps TextColor to a colour span and a BackgroundColor highlight to a colour + background span", () => {
        expect(renderInlineText("Red", [mark(0, 3, "TextColor", "red")])).toBe('<span style="color:#e2400c">Red</span>');
        // A highlight with no explicit text colour gets Anytype's default dark text (#252525) so it stays
        // readable on dark themes — otherwise the theme-default white text is invisible on the pale highlight.
        expect(renderInlineText("Red", [mark(0, 3, "BackgroundColor", "red")])).toBe(
            '<span style="color:#252525;background-color:#fcd1c3">Red</span>'
        );
    });

    it("combines co-occurring text + background colour into one span, nested inside structural marks", () => {
        // An explicit text colour wins over the highlight default, and both fold into a single span.
        expect(renderInlineText("Red", [mark(0, 3, "TextColor", "red"), mark(0, 3, "BackgroundColor", "red")])).toBe(
            '<span style="color:#e2400c;background-color:#fcd1c3">Red</span>'
        );
        // A structural mark stays outermost; the colour span nests inside it.
        expect(renderInlineText("Red", [mark(0, 3, "Bold"), mark(0, 3, "TextColor", "red")])).toBe(
            '<strong><span style="color:#e2400c">Red</span></strong>'
        );
    });

    it("colours each word independently across a palette line (as the page exports it)", () => {
        expect(renderInlineText("Grey Red", [mark(0, 4, "TextColor", "grey"), mark(5, 8, "TextColor", "red")])).toBe(
            '<span style="color:#8c9ea5">Grey</span> <span style="color:#e2400c">Red</span>'
        );
    });

    it("ignores an unknown colour name and genuinely unsupported mark types", () => {
        expect(renderInlineText("x", [mark(0, 1, "TextColor", "chartreuse")])).toBe("x");
        expect(renderInlineText("@bob", [mark(0, 4, "Mention", "someObjectId")])).toBe("@bob");
    });

    it("escapes HTML inside a marked range", () => {
        expect(renderInlineText("a<b", [mark(0, 3, "Bold")])).toBe("<strong>a&lt;b</strong>");
    });

    it("clamps out-of-range offsets and drops empty / reversed ranges", () => {
        expect(renderInlineText("hi", [mark(0, 100, "Bold")])).toBe("<strong>hi</strong>");
        expect(renderInlineText("hi", [mark(1, 1, "Bold")])).toBe("hi");
        expect(renderInlineText("hi", [mark(2, 0, "Bold")])).toBe("hi");
    });
});

describe("renderCodeBlock", () => {
    it("wraps code in <pre><code> with the resolved language class", () => {
        // Anytype tags C-family code as PrismJS "clike"; Trilium has no such code, so it's aliased to C.
        expect(renderCodeBlock("int x;", "clike")).toBe('<pre><code class="language-text-x-csrc">int x;</code></pre>');
    });

    it("resolves a language code that matches a Trilium markdown name directly", () => {
        expect(renderCodeBlock("print(1)", "python")).toBe('<pre><code class="language-text-x-python">print(1)</code></pre>');
    });

    it("falls back to auto-detect for an unknown or missing language", () => {
        expect(renderCodeBlock("plain", "nonsense")).toBe('<pre><code class="language-text-x-trilium-auto">plain</code></pre>');
        expect(renderCodeBlock("plain", undefined)).toBe('<pre><code class="language-text-x-trilium-auto">plain</code></pre>');
    });

    it("escapes HTML and keeps quotes literal, preserving newlines and tabs", () => {
        expect(renderCodeBlock('a<b & c>\n\t"q"', "clike")).toBe('<pre><code class="language-text-x-csrc">a&lt;b &amp; c&gt;\n\t"q"</code></pre>');
    });
});
