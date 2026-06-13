import { _setModelData as setModelData, ClassicEditor, Essentials, Paragraph, Strikethrough } from "ckeditor5";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import StrikethroughAsDel from "./strikethrough_as_del.js";

describe("StrikethroughAsDel", () => {
    let editorElement: HTMLDivElement;
    let editor: ClassicEditor;

    beforeEach(async () => {
        editorElement = document.createElement("div");
        document.body.appendChild(editorElement);

        editor = await ClassicEditor.create(editorElement, {
            licenseKey: "GPL",
            plugins: [Essentials, Paragraph, Strikethrough, StrikethroughAsDel]
        });
    });

    afterEach(async () => {
        editorElement.remove();
        await editor.destroy();
    });

    it("registers the plugin", () => {
        expect(editor.plugins.get(StrikethroughAsDel)).toBeInstanceOf(StrikethroughAsDel);
    });

    it("downcasts strikethrough attribute to <del> instead of <s>", () => {
        setModelData(editor.model, "<paragraph><$text strikethrough=\"true\">hello</$text></paragraph>");
        const data = editor.getData();
        expect(data).toContain("<del>");
        expect(data).not.toContain("<s>");
    });

    it("upcasts <del> from HTML so getData returns <del>", () => {
        editor.setData("<p><del>world</del></p>");
        const data = editor.getData();
        expect(data).toContain("<del>");
    });

    it("upcasts <del> from HTML so the model has strikethrough attribute", () => {
        editor.setData("<p><del>test</del></p>");
        const root = editor.model.document.getRoot();
        if (!root) {
            throw new Error("Model root not found");
        }
        const paragraph = root.getChild(0);
        if (!paragraph) {
            throw new Error("Paragraph not found");
        }
        // After upcast (via Strikethrough plugin), the text should have strikethrough attribute
        // and re-downcast via our plugin to <del>
        const output = editor.getData();
        expect(output).toContain("<del>test</del>");
    });

    it("produces <del> wrapping when strikethrough spans partial text", () => {
        setModelData(
            editor.model,
            "<paragraph>foo<$text strikethrough=\"true\">bar</$text>baz</paragraph>"
        );
        const data = editor.getData();
        expect(data).toContain("<del>bar</del>");
        expect(data).not.toContain("<s>bar</s>");
    });
});
