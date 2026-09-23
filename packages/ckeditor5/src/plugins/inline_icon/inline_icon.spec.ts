import {
    _getModelData as getModelData, _getViewData as getViewData, _setModelData as setModelData,
    type ButtonView, type ClassicEditor, GeneralHtmlSupport, Paragraph
} from "ckeditor5";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestEditor } from "../../../test/editor-kit.js";
import { installGlobMock } from "../../../test/globals-test-kit.js";
import InlineIcon from "./inline_icon.js";
import InlineIconEditing from "./inline_icon_editing.js";
import InlineIconUI from "./inline_icon_ui.js";

describe("InlineIcon", () => {
    let editor: ClassicEditor;

    beforeEach(async () => {
        editor = await createTestEditor([ Paragraph, InlineIcon ]);
    });

    it("loads the glue plugin and its editing/UI parts", () => {
        expect(editor.plugins.get(InlineIcon)).toBeInstanceOf(InlineIcon);
        expect(editor.plugins.get(InlineIconEditing)).toBeInstanceOf(InlineIconEditing);
        expect(editor.plugins.get(InlineIconUI)).toBeInstanceOf(InlineIconUI);
        expect(InlineIcon.pluginName).toBe("InlineIcon");
    });

    it("registers the icon as an inline object that goes wherever text goes", () => {
        const schema = editor.model.schema;
        setModelData(editor.model, "<paragraph>[]</paragraph>");
        const paragraph = editor.model.document.getRoot()?.getChild(0);

        expect({
            isInline: schema.isInline("inlineIcon"),
            isObject: schema.isObject("inlineIcon"),
            inParagraph: !!paragraph && schema.checkChild(paragraph, "inlineIcon"),
            carriesIconClass: schema.checkAttribute("inlineIcon", "iconClass")
        }).toEqual({ isInline: true, isObject: true, inParagraph: true, carriesIconClass: true });
    });

    it("inserts the icon in the form icons take everywhere else, as a widget while editing", () => {
        setModelData(editor.model, "<paragraph>Press []</paragraph>");

        editor.execute("insertIcon", { iconClass: "bx bx-cog" });

        expect(editor.getData()).toBe(`<p>Press&nbsp;<span class="tn-icon bx bx-cog"></span></p>`);
        expect(getViewData(editor.editing.view, { withoutSelection: true }))
            .toBe(`<p>Press <span class="bx bx-cog ck-widget tn-icon"` +
                ` contenteditable="false"></span></p>`);
    });

    it("upcasts a stored icon back, keeping the pack's classes and dropping the marker", () => {
        editor.setData(`<p>Press <span class="tn-icon bx bx-cog"></span>.</p>`);

        expect(getModelData(editor.model, { withoutSelection: true }))
            .toBe(`<paragraph>Press <inlineIcon iconClass="bx bx-cog"></inlineIcon>.</paragraph>`);
    });

    it("ignores an insert that names no icon", () => {
        setModelData(editor.model, "<paragraph>[]</paragraph>");

        editor.execute("insertIcon", { iconClass: "  " });

        expect(editor.getData()).toBe("");
    });

    it("disables the command in a place that takes no text", () => {
        const command = editor.commands.get("insertIcon");
        expect(command?.isEnabled).toBe(true);

        editor.enableReadOnlyMode("spec");
        expect(command?.isEnabled).toBe(false);
    });

    it("asks the host to open its icon picker, rather than picking itself", () => {
        const triggerCommand = vi.fn();
        installGlobMock({ getComponentByEl: () => ({ triggerCommand }) });

        const button = editor.ui.componentFactory.create("insertIcon") as unknown as ButtonView;
        button.fire("execute");

        expect(triggerCommand).toHaveBeenCalledWith("insertIconToText");
    });
});

describe("InlineIcon under the shipped General HTML Support configuration", () => {
    // `textNoteHtmlSupportEnabled` ships off, which leaves GHS with an empty allow-list: a span
    // carrying nothing but classes is dropped unless a plugin claims it.
    it("keeps an icon that the plugin models, and loses one that nothing does", async () => {
        const withPlugin = await createTestEditor([ Paragraph, InlineIcon, GeneralHtmlSupport ], {
            htmlSupport: { allow: [] }
        });
        const withoutPlugin = await createTestEditor([ Paragraph, GeneralHtmlSupport ], {
            htmlSupport: { allow: [] }
        });

        const stored = `<p>Press <span class="tn-icon bx bx-cog"></span>.</p>`;

        withPlugin.setData(stored);
        withoutPlugin.setData(stored);

        expect(withPlugin.getData()).toBe(`<p>Press <span class="tn-icon bx bx-cog"></span>.</p>`);
        expect(withoutPlugin.getData()).toBe("<p>Press .</p>");
    });
});
