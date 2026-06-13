import { _setModelData as setModelData, Bold, ClassicEditor, Essentials, Italic, Paragraph } from "ckeditor5";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import ItalicAsEmPlugin from "./italic_as_em.js";

describe("ItalicAsEmPlugin", () => {
    let editorElement: HTMLDivElement;
    let editor: ClassicEditor;

    beforeEach(async () => {
        editorElement = document.createElement("div");
        document.body.appendChild(editorElement);

        editor = await ClassicEditor.create(editorElement, {
            licenseKey: "GPL",
            plugins: [Essentials, Paragraph, Bold, Italic, ItalicAsEmPlugin]
        });
    });

    afterEach(async () => {
        editorElement.remove();
        await editor.destroy();
    });

    it("loads the plugin", () => {
        expect(editor.plugins.get(ItalicAsEmPlugin)).toBeInstanceOf(ItalicAsEmPlugin);
    });

    it("downcasts italic model attribute to <em> element", () => {
        setModelData(editor.model, "<paragraph><$text italic=\"true\">hello</$text></paragraph>");
        const data = editor.getData();
        expect(data).toContain("<em>");
        expect(data).toContain("</em>");
        expect(data).not.toContain("<i>");
    });

    it("round-trips italic text through setData with <em> in the output", () => {
        editor.setData("<p><em>world</em></p>");
        const data = editor.getData();
        expect(data).toContain("<em>");
        expect(data).not.toContain("<i>");
    });

    it("non-italic text is not wrapped in <em>", () => {
        setModelData(editor.model, "<paragraph>plain text</paragraph>");
        const data = editor.getData();
        expect(data).not.toContain("<em>");
        expect(data).not.toContain("<i>");
    });

    it("bold text is not wrapped in <em>", () => {
        setModelData(editor.model, "<paragraph><$text bold=\"true\">bold</$text></paragraph>");
        const data = editor.getData();
        expect(data).toContain("<strong>");
        expect(data).not.toContain("<em>");
    });
});
