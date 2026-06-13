import { _setModelData as setModelData, Bold, Bookmark, ClassicEditor, Essentials, Paragraph } from "ckeditor5";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CopyAnchorLinkButton from "./copy_anchor_link.js";

describe("CopyAnchorLinkButton", () => {
    let editorElement: HTMLDivElement;
    let editor: ClassicEditor;
    let getActiveContextNote: ReturnType<typeof vi.fn>;
    let getReferenceLinkTitleSync: ReturnType<typeof vi.fn>;
    let clipboardWrite: ReturnType<typeof vi.fn>;
    let originalClipboard: typeof navigator.clipboard;

    beforeEach(async () => {
        getActiveContextNote = vi.fn(() => ({ noteId: "noteAbc" }));
        getReferenceLinkTitleSync = vi.fn(() => "Some title");
        globalThis.glob = {
            getActiveContextNote,
            getReferenceLinkTitleSync
        } as unknown as typeof glob;

        clipboardWrite = vi.fn(() => Promise.resolve());
        originalClipboard = navigator.clipboard;
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { write: clipboardWrite }
        });

        editorElement = document.createElement("div");
        document.body.appendChild(editorElement);

        editor = await ClassicEditor.create(editorElement, {
            licenseKey: "GPL",
            plugins: [Essentials, Paragraph, Bold, Bookmark, CopyAnchorLinkButton]
        });
    });

    afterEach(async () => {
        editorElement.remove();
        await editor.destroy();
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: originalClipboard
        });
    });

    function getButton() {
        return editor.ui.componentFactory.create("copyAnchorLink") as { fire(name: string): void };
    }

    it("loads the plugin and registers the toolbar button", () => {
        expect(editor.plugins.get(CopyAnchorLinkButton)).toBeInstanceOf(CopyAnchorLinkButton);
        expect(editor.ui.componentFactory.has("copyAnchorLink")).toBe(true);
    });

    it("copies a reference link to the clipboard when a bookmark is selected", () => {
        setModelData(editor.model, "<paragraph>[<bookmark bookmarkId=\"my anchor\"></bookmark>]</paragraph>");

        getButton().fire("execute");

        expect(getReferenceLinkTitleSync).toHaveBeenCalledWith("#root/noteAbc?bookmark=my%20anchor");
        expect(clipboardWrite).toHaveBeenCalledTimes(1);

        const items = clipboardWrite.mock.calls[0]?.[0] as ClipboardItem[];
        expect(items).toHaveLength(1);
        const item = items[0];
        expect(item?.types).toEqual(expect.arrayContaining(["text/html", "text/plain"]));
    });

    it("escapes HTML special characters in the generated link", async () => {
        getReferenceLinkTitleSync.mockReturnValue("a<b>&\"c");
        setModelData(editor.model, "<paragraph>[<bookmark bookmarkId=\"anchor\"></bookmark>]</paragraph>");

        getButton().fire("execute");

        const items = clipboardWrite.mock.calls[0]?.[0] as ClipboardItem[];
        const htmlBlob = await items[0]?.getType("text/html");
        const html = await htmlBlob?.text();
        expect(html).toContain("&lt;b&gt;");
        expect(html).toContain("&amp;");
        expect(html).toContain("&quot;");
        expect(html).not.toContain("<b>");
    });

    it("does nothing when the selected element is not a bookmark", () => {
        setModelData(editor.model, "<paragraph>[foo]</paragraph>");

        getButton().fire("execute");

        expect(getActiveContextNote).not.toHaveBeenCalled();
        expect(clipboardWrite).not.toHaveBeenCalled();
    });

    it("does nothing when there is no selected element", () => {
        setModelData(editor.model, "<paragraph>foo[]bar</paragraph>");

        getButton().fire("execute");

        expect(getActiveContextNote).not.toHaveBeenCalled();
        expect(clipboardWrite).not.toHaveBeenCalled();
    });

    it("does nothing when there is no active context note", () => {
        getActiveContextNote.mockReturnValue(undefined);
        setModelData(editor.model, "<paragraph>[<bookmark bookmarkId=\"anchor\"></bookmark>]</paragraph>");

        getButton().fire("execute");

        expect(getReferenceLinkTitleSync).not.toHaveBeenCalled();
        expect(clipboardWrite).not.toHaveBeenCalled();
    });
});
