import { _setModelData as setModelData, ClassicEditor, Essentials, Paragraph } from "ckeditor5";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CutToNotePlugin from "./cuttonote.js";

describe("CutToNotePlugin", () => {
    let editorElement: HTMLDivElement;
    let editor: ClassicEditor;
    let triggerCommand: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        triggerCommand = vi.fn();
        globalThis.glob = {
            getComponentByEl: () => ({ triggerCommand })
        } as unknown as typeof glob;

        editorElement = document.createElement("div");
        document.body.appendChild(editorElement);

        editor = await ClassicEditor.create(editorElement, {
            licenseKey: "GPL",
            plugins: [Essentials, Paragraph, CutToNotePlugin]
        });
    });

    afterEach(async () => {
        delete (globalThis as { glob?: unknown }).glob;
        editorElement.remove();
        await editor.destroy();
    });

    it("loads the plugin and registers the toolbar button", () => {
        expect(editor.plugins.get(CutToNotePlugin)).toBeInstanceOf(CutToNotePlugin);
        expect(editor.ui.componentFactory.has("cutToNote")).toBe(true);
    });

    it("triggers the cutIntoNote command on the Trilium component when the button is executed", () => {
        const view = editor.ui.componentFactory.create("cutToNote") as { fire(name: string): void };
        view.fire("execute");
        expect(triggerCommand).toHaveBeenCalledWith("cutIntoNote");
    });

    it("augments the editor with getSelectedHtml that serializes the selected content", () => {
        setModelData(editor.model, "<paragraph>foo[bar]baz</paragraph>");

        const html = editor.getSelectedHtml();
        expect(html).toContain("bar");
        expect(html).not.toContain("foo");
        expect(html).not.toContain("baz");
    });

    it("serializes a multi-paragraph selection into block markup via getSelectedHtml", () => {
        setModelData(editor.model, "<paragraph>[first</paragraph><paragraph>second]</paragraph>");

        const html = editor.getSelectedHtml();
        expect(html).toContain("first");
        expect(html).toContain("second");
        expect(html).toContain("<p>");
    });

    it("removeSelection deletes the selection, inserts a paragraph and saves the note", async () => {
        setModelData(editor.model, "<paragraph>foo[bar]baz</paragraph>");

        await editor.removeSelection();

        expect(editor.getData()).not.toContain("bar");
        expect(editor.getData()).toContain("foobaz");
        expect(triggerCommand).toHaveBeenCalledWith("saveNoteDetailNow");
    });

    it("removeSelection on a collapsed selection still inserts a paragraph and saves", async () => {
        setModelData(editor.model, "<paragraph>foo[]bar</paragraph>");

        await editor.removeSelection();

        expect(editor.getData()).toContain("foobar");
        expect(triggerCommand).toHaveBeenCalledWith("saveNoteDetailNow");
    });
});
