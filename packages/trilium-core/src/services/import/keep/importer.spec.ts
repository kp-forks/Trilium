import { describe, expect, it } from "vitest";

import { parseNote } from "./importer.js";

describe("Google Keep importer — parseNote", () => {
    it("parses a titled plain-text note: title, paragraphs and original timestamps", () => {
        const json = JSON.stringify({
            title: "Asdf",
            textContent: "Hi there. ",
            createdTimestampUsec: 1763069966429000,
            userEditedTimestampUsec: 1763069966429000
        });

        const note = parseNote("Asdf.json", json);

        expect(note).toEqual({
            title: "Asdf",
            content: "<p>Hi there. </p>",
            utcDateCreated: "2025-11-13 21:39:26.429Z",
            utcDateModified: "2025-11-13 21:39:26.429Z"
        });
    });

    it("falls back to the (timestamp) filename for an untitled note", () => {
        const json = JSON.stringify({ title: "", textContent: "Dsaa" });

        const note = parseNote("2025-11-13T23_39_37.236+02_00.json", json);

        expect(note?.title).toBe("2025-11-13T23_39_37.236+02_00");
    });

    it("renders a multi-line body as one paragraph per line, escaping HTML", () => {
        const json = JSON.stringify({ textContent: "Heading 1\nHeading 2\nBold & <b>italic</b>" });

        const note = parseNote("note.json", json);

        expect(note?.content).toBe("<p>Heading 1</p><p>Heading 2</p><p>Bold &amp; &lt;b&gt;italic&lt;/b&gt;</p>");
    });

    it("renders a checklist as a CKEditor task list with checked state, skipping empty items", () => {
        const json = JSON.stringify({
            listContent: [
                { text: "This is a note with", isChecked: false },
                { text: "check", isChecked: true },
                { text: "", isChecked: false }
            ]
        });

        const note = parseNote("list.json", json);

        expect(note?.content).toBe(
            `<ul class="todo-list">` +
                `<li><label class="todo-list__label"><input type="checkbox" disabled="disabled"><span class="todo-list__label__description">This is a note with</span></label></li>` +
                `<li><label class="todo-list__label"><input type="checkbox" checked="checked" disabled="disabled"><span class="todo-list__label__description">check</span></label></li>` +
                `</ul>`
        );
    });

    it("prefers the rich-text body, converting basic formatting (textContentHtml over textContent)", () => {
        const json = JSON.stringify({
            textContent: "Bold",
            textContentHtml: `<p dir="ltr" style="line-height:1.38;"><span style="font-weight:700;">Bold</span></p>`
        });

        const note = parseNote("note.json", json);

        expect(note?.content).toBe("<p><strong>Bold</strong></p>");
    });

    it("prefers a checklist item's rich-text (textHtml over text)", () => {
        const json = JSON.stringify({
            listContent: [{ text: "done", textHtml: `<p><span style="font-style:italic;">done</span></p>`, isChecked: true }]
        });

        const note = parseNote("list.json", json);

        expect(note?.content).toBe(
            `<ul class="todo-list">` +
                `<li><label class="todo-list__label"><input type="checkbox" checked="checked" disabled="disabled"><span class="todo-list__label__description"><i>done</i></span></label></li>` +
                `</ul>`
        );
    });

    it("uses distinct created/modified timestamps when both are present", () => {
        const json = JSON.stringify({
            textContent: "x",
            createdTimestampUsec: 1782029545375000,
            userEditedTimestampUsec: 1782029654353000
        });

        const note = parseNote("note.json", json);

        expect(note?.utcDateCreated).toBe("2026-06-21 08:12:25.375Z");
        expect(note?.utcDateModified).toBe("2026-06-21 08:14:14.353Z");
    });

    it("leaves timestamps undefined and content empty for a bare note", () => {
        const note = parseNote("empty.json", JSON.stringify({}));

        expect(note).toEqual({ title: "empty", content: "", utcDateCreated: undefined, utcDateModified: undefined });
    });

    it("skips a malformed JSON entry rather than throwing", () => {
        expect(parseNote("broken.json", "{ not valid json")).toBeNull();
    });
});
