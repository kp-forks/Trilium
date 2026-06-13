import { ClassicEditor, Essentials, Paragraph } from "ckeditor5";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import Uploadfileplugin from "./uploadfileplugin.js";

describe("Uploadfileplugin", () => {
    let editorElement: HTMLDivElement;
    let editor: ClassicEditor;

    beforeEach(async () => {
        editorElement = document.createElement("div");
        document.body.appendChild(editorElement);

        editor = await ClassicEditor.create(editorElement, {
            licenseKey: "GPL",
            plugins: [Essentials, Paragraph, Uploadfileplugin]
        });
    });

    afterEach(async () => {
        editorElement.remove();
        await editor.destroy();
    });

    it("loads the plugin and its required FileUploadEditing dependency", () => {
        expect(editor.plugins.get(Uploadfileplugin)).toBeInstanceOf(Uploadfileplugin);
    });

    it("has the correct pluginName", () => {
        expect(Uploadfileplugin.pluginName).toBe("fileUploadPlugin");
    });

    it("declares FileUploadEditing as a required plugin", () => {
        const requires = Uploadfileplugin.requires;
        expect(requires).toHaveLength(1);
        const FileUploadEditing = requires[0];
        expect(editor.plugins.has(FileUploadEditing as never)).toBe(true);
    });
});
