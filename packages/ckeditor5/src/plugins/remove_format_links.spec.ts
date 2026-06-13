import { ClassicEditor, Essentials, Link, Paragraph, RemoveFormat } from "ckeditor5";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import RemoveFormatLinksPlugin from "./remove_format_links.js";

describe("RemoveFormatLinksPlugin", () => {
    let editorElement: HTMLDivElement;
    let editor: ClassicEditor;

    beforeEach(async () => {
        editorElement = document.createElement("div");
        document.body.appendChild(editorElement);

        editor = await ClassicEditor.create(editorElement, {
            licenseKey: "GPL",
            plugins: [Essentials, Paragraph, Link, RemoveFormat, RemoveFormatLinksPlugin]
        });
    });

    afterEach(async () => {
        editorElement.remove();
        await editor.destroy();
    });

    it("registers itself as a plugin", () => {
        expect(editor.plugins.get(RemoveFormatLinksPlugin)).toBeInstanceOf(RemoveFormatLinksPlugin);
    });

    it("declares RemoveFormat as a required dependency", () => {
        expect(RemoveFormatLinksPlugin.requires).toContain(RemoveFormat);
    });

    it("marks the linkHref attribute as formatting so RemoveFormat strips it", () => {
        const props = editor.model.schema.getAttributeProperties("linkHref");
        expect(props.isFormatting).toBe(true);
    });
});
