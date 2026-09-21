import { EditorSelection } from "@codemirror/state";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFieldEditor, type FieldEditor, type FieldEditorConfig } from "./field_editor.js";

let editor: FieldEditor | undefined;

afterEach(() => {
    editor?.destroy();
    editor = undefined;
});

describe("createFieldEditor", () => {
    it("mounts with the given document and reports every change", () => {
        const onChange = vi.fn();
        const parent = document.createElement("div");
        document.body.appendChild(parent);
        editor = createFieldEditor({ parent, doc: "#book", onChange });

        expect(parent.contains(editor.dom)).toBe(true);
        expect(editor.state.doc.toString()).toBe("#book");
        // The initial document is not a change.
        expect(onChange).not.toHaveBeenCalled();

        editor.dispatch({ changes: { from: 5, insert: " #year = 1954" } });

        expect(onChange).toHaveBeenCalledWith("#book #year = 1954");
    });

    it("treats Enter as a command rather than a line break", () => {
        const onEnter = vi.fn();
        editor = build({ doc: "#book", onEnter });
        editor.dispatch({ selection: EditorSelection.cursor(5) });

        expect(pressEnter(editor)).toBe(true);
        expect(onEnter).toHaveBeenCalledOnce();
        expect(editor.state.doc.toString()).toBe("#book");
    });

    it("breaks the line on Shift-Enter, keeping the indentation", () => {
        const onEnter = vi.fn();
        const onChange = vi.fn();
        editor = build({ doc: "#book\n    and #author", onEnter, onChange });
        editor.dispatch({ selection: EditorSelection.cursor(editor.state.doc.length) });

        expect(pressEnter(editor, { shiftKey: true })).toBe(true);
        expect(onEnter).not.toHaveBeenCalled();
        expect(editor.state.doc.toString()).toBe("#book\n    and #author\n    ");
        expect(onChange).toHaveBeenLastCalledWith("#book\n    and #author\n    ");
    });

    it("keeps the line breaks in inserted text", () => {
        const onChange = vi.fn();
        editor = build({ onChange });

        editor.dispatch({ changes: { from: 0, insert: "#book\n  #year = 1954" } });

        expect(editor.state.doc.lines).toBe(2);
        expect(onChange).toHaveBeenLastCalledWith("#book\n  #year = 1954");
    });
});

function build(config: Partial<FieldEditorConfig> = {}): FieldEditor {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    return createFieldEditor({ parent, ...config });
}

/** Presses Enter on the editor and answers whether a binding handled it. */
function pressEnter(editor: FieldEditor, init: KeyboardEventInit = {}) {
    return !editor.contentDOM.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
        ...init
    }));
}
