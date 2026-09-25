import { _getModelData, _setModelData, Bold, ButtonView, ClassicEditor, Essentials, HorizontalLine, Paragraph } from "ckeditor5";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestEditor } from "../../test/editor-kit.js";
import { installGlobMock } from "../../test/globals-test-kit.js";
import InsertDateTimePlugin, { COMMAND_NAME } from "./insert_date_time.js";

describe("InsertDateTimePlugin", () => {
    let editor: ClassicEditor;
    let formatDateTime: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        formatDateTime = vi.fn(() => "2026-09-25 10:30");
        installGlobMock({
            getComponentByEl: () => ({ formatDateTime })
        });

        editor = await createTestEditor([Essentials, Paragraph, Bold, HorizontalLine, InsertDateTimePlugin]);
    });

    it("loads the plugin and registers the command and toolbar button", () => {
        expect(editor.plugins.get(InsertDateTimePlugin)).toBeInstanceOf(InsertDateTimePlugin);
        expect(editor.commands.get(COMMAND_NAME)).toBeDefined();
        expect(editor.ui.componentFactory.has("dateTime")).toBe(true);

        // No dictionary is configured here, so `t()` renders the message id, which is the English
        // label.
        const view = editor.ui.componentFactory.create("dateTime") as { label?: string };
        expect(view.label).toBe("Insert date/time");
    });

    it("inserts the date formatted by the host at the caret", () => {
        _setModelData(editor.model, "<paragraph>Due: []</paragraph>");
        editor.execute(COMMAND_NAME);

        expect(formatDateTime).toHaveBeenCalledWith(expect.any(Date));
        expect(_getModelData(editor.model)).toBe("<paragraph>Due: 2026-09-25 10:30[]</paragraph>");
    });

    it("replaces a selection and keeps its formatting", () => {
        _setModelData(editor.model, "<paragraph>Due: <$text bold=\"true\">[yesterday]</$text></paragraph>");
        editor.execute(COMMAND_NAME);

        expect(_getModelData(editor.model))
            .toBe("<paragraph>Due: <$text bold=\"true\">2026-09-25 10:30[]</$text></paragraph>");
    });

    it("replaces a selected widget with a paragraph holding the date", () => {
        _setModelData(editor.model, "<paragraph>a</paragraph>[<horizontalLine></horizontalLine>]");
        editor.execute(COMMAND_NAME);

        expect(_getModelData(editor.model))
            .toBe("<paragraph>a</paragraph><paragraph>2026-09-25 10:30[]</paragraph>");
    });

    it("undoes the insertion in a single step", () => {
        _setModelData(editor.model, "<paragraph>[yesterday]</paragraph>");
        editor.execute(COMMAND_NAME);
        editor.execute("undo");

        expect(_getModelData(editor.model)).toBe("<paragraph>[yesterday]</paragraph>");
    });

    it("wires the button to the command (enablement and execution)", () => {
        const view = editor.ui.componentFactory.create("dateTime") as ButtonView;
        const command = editor.commands.get(COMMAND_NAME);

        expect(view.isEnabled).toBe(command?.isEnabled);

        const spy = vi.spyOn(editor, "execute");
        view.fire("execute");
        expect(spy).toHaveBeenCalledWith(COMMAND_NAME);
    });

    it("is enabled only when the editor is editable", () => {
        const command = editor.commands.get(COMMAND_NAME);
        expect(command?.isEnabled).toBe(true);

        editor.enableReadOnlyMode("test");
        expect(command?.isEnabled).toBe(false);
        editor.disableReadOnlyMode("test");
    });
});
