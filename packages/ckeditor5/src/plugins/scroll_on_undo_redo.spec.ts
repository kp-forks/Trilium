import { _setModelData as setModelData, ClassicEditor, Essentials, Paragraph, Undo } from "ckeditor5";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ScrollOnUndoRedoPlugin from "./scroll_on_undo_redo.js";

describe("ScrollOnUndoRedoPlugin", () => {
    let editorElement: HTMLDivElement;
    let editor: ClassicEditor;

    beforeEach(async () => {
        editorElement = document.createElement("div");
        document.body.appendChild(editorElement);

        // Create the editor with real timers so CKEditor's internal rAF/timeout usage works.
        editor = await ClassicEditor.create(editorElement, {
            licenseKey: "GPL",
            plugins: [Essentials, Paragraph, Undo, ScrollOnUndoRedoPlugin]
        });
    });

    afterEach(async () => {
        vi.useRealTimers();
        editorElement.remove();
        await editor.destroy();
    });

    it("loads the plugin", () => {
        expect(editor.plugins.get(ScrollOnUndoRedoPlugin)).toBeInstanceOf(ScrollOnUndoRedoPlugin);
    });

    it("calls scrollToTheSelection via requestAnimationFrame after undo", () => {
        // Switch to fake timers AFTER the editor is fully initialised.
        vi.useFakeTimers();

        const scrollSpy = vi.spyOn(editor.editing.view, "scrollToTheSelection");

        // Make a change so there is something to undo.
        setModelData(editor.model, "<paragraph>hello[]</paragraph>");
        editor.model.change((writer) => {
            const pos = editor.model.document.selection.getFirstPosition();
            if (pos) {
                writer.insertText(" world", pos);
            }
        });

        editor.execute("undo");

        // scrollToTheSelection should NOT be called synchronously — it is scheduled via rAF.
        expect(scrollSpy).not.toHaveBeenCalled();

        vi.runAllTimers();

        expect(scrollSpy).toHaveBeenCalledTimes(1);
    });

    it("calls scrollToTheSelection via requestAnimationFrame after redo", async () => {
        // Make a change, undo it (with real timers), then switch to fake timers for redo.
        setModelData(editor.model, "<paragraph>hello[]</paragraph>");
        editor.model.change((writer) => {
            const pos = editor.model.document.selection.getFirstPosition();
            if (pos) {
                writer.insertText(" world", pos);
            }
        });

        editor.execute("undo");

        // Let the undo rAF fire with real timers.
        await new Promise((resolve) => requestAnimationFrame(resolve));

        // Now switch to fake timers for the redo assertion.
        vi.useFakeTimers();
        const scrollSpy = vi.spyOn(editor.editing.view, "scrollToTheSelection");

        editor.execute("redo");

        expect(scrollSpy).not.toHaveBeenCalled();

        vi.runAllTimers();

        expect(scrollSpy).toHaveBeenCalledTimes(1);
    });

    it("calls scrollToTheSelection for each undo in a sequence", () => {
        vi.useFakeTimers();

        const scrollSpy = vi.spyOn(editor.editing.view, "scrollToTheSelection");

        setModelData(editor.model, "<paragraph>[]</paragraph>");
        editor.model.change((writer) => {
            const pos = editor.model.document.selection.getFirstPosition();
            if (pos) {
                writer.insertText("a", pos);
            }
        });
        editor.model.change((writer) => {
            const pos = editor.model.document.selection.getFirstPosition();
            if (pos) {
                writer.insertText("b", pos);
            }
        });

        editor.execute("undo");
        editor.execute("undo");

        vi.runAllTimers();

        expect(scrollSpy).toHaveBeenCalledTimes(2);
    });
});
