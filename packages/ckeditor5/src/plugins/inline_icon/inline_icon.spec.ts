import {
    _getModelData as getModelData, _getViewData as getViewData, _setModelData as setModelData,
    type ButtonView, type ClassicEditor, ContextualBalloon, GeneralHtmlSupport, Paragraph
} from "ckeditor5";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

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

    it("keeps a marked span that names no pack as it found it", () => {
        editor.setData(`<p><span class="tn-icon"></span></p>`);

        expect(editor.getData()).toBe(`<p><span class="tn-icon"></span></p>`);
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

});

describe("the balloon InlineIcon picks in", () => {
    let editor: ClassicEditor;
    let showIconPicker: Mock<(request: IconPickerRequest) => (() => void) | null>;
    let release: Mock<() => void>;

    beforeEach(async () => {
        release = vi.fn();
        showIconPicker = vi.fn(() => release);
        installGlobMock({ getComponentByEl: () => ({ showIconPicker }) });

        editor = await createTestEditor([ Paragraph, InlineIcon ]);
        setModelData(editor.model, "<paragraph>[]</paragraph>");
    });

    it("hands the host the balloon's own element to paint into", () => {
        pressInsertIcon(editor);

        const balloon = editor.plugins.get(ContextualBalloon);
        const { container } = showIconPicker.mock.calls[0][0];

        expect(balloon.visibleView).not.toBeNull();
        expect(balloon.view.element?.contains(container)).toBe(true);
        // Everything a balloon shows sits inside the body collection's `ck-reset_all`, which would
        // strip the application's own styling off the picker.
        expect(container.classList.contains("ck-reset_all-excluded")).toBe(true);
    });

    it("inserts what the host reports, and lets go of the picker", () => {
        pressInsertIcon(editor);

        showIconPicker.mock.calls[0][0].onSelect("bx bx-cog");

        expect(editor.getData()).toBe(`<p><span class="tn-icon bx bx-cog"></span></p>`);
        expect(release).toHaveBeenCalledOnce();
        expect(editor.plugins.get(ContextualBalloon).visibleView).toBeNull();
    });

    it("takes the balloon back down for a host that shows the picker its own way", () => {
        showIconPicker.mockReturnValue(null);

        pressInsertIcon(editor);

        expect(showIconPicker).toHaveBeenCalledOnce();
        expect(editor.plugins.get(ContextualBalloon).visibleView).toBeNull();
    });

    it("lets go of the picker when a click lands outside the balloon", () => {
        pressInsertIcon(editor);

        document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

        expect(release).toHaveBeenCalledOnce();
        expect(editor.plugins.get(ContextualBalloon).visibleView).toBeNull();
    });

    it("lets go of the picker on Esc, from the text and from the picker alike", () => {
        pressInsertIcon(editor);
        const container = showIconPicker.mock.calls[0][0].container;

        // Esc reaches the editor only while the caret still has focus; once the picker has taken
        // it, the balloon's own element is where the key lands.
        container.dispatchEvent(escapeKeyDown());
        expect(release).toHaveBeenCalledOnce();
        expect(editor.plugins.get(ContextualBalloon).visibleView).toBeNull();

        pressInsertIcon(editor);
        editor.editing.view.getDomRoot()?.dispatchEvent(escapeKeyDown());

        expect(release).toHaveBeenCalledTimes(2);
        expect(editor.plugins.get(ContextualBalloon).visibleView).toBeNull();
    });

    it("leaves the one balloon it has open alone when the button is pressed again", () => {
        pressInsertIcon(editor);
        pressInsertIcon(editor);

        expect(showIconPicker).toHaveBeenCalledOnce();
        expect(release).not.toHaveBeenCalled();
    });

    it("leaves Esc to the rest of the editor while no picker is open", () => {
        const escape = escapeKeyDown();
        editor.editing.view.getDomRoot()?.dispatchEvent(escape);

        expect(escape.defaultPrevented).toBe(false);
        expect(release).not.toHaveBeenCalled();
    });

    it("lets go of the picker when the editor is torn down under it", async () => {
        pressInsertIcon(editor);

        await editor.destroy();

        expect(release).toHaveBeenCalledOnce();
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

function pressInsertIcon(editor: ClassicEditor) {
    const button = editor.ui.componentFactory.create("insertIcon") as unknown as ButtonView;
    button.fire("execute");
}

function escapeKeyDown() {
    return new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true });
}
