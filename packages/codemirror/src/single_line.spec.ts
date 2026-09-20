import { EditorSelection } from "@codemirror/state";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSingleLineEditor, type SingleLineEditor, type SingleLineEditorConfig } from "./single_line.js";

let editor: SingleLineEditor | undefined;

afterEach(() => {
    editor?.destroy();
    editor = undefined;
});

describe("createSingleLineEditor", () => {
    it("mounts with the given document and reports every change", () => {
        const onChange = vi.fn();
        const parent = document.createElement("div");
        document.body.appendChild(parent);
        editor = createSingleLineEditor({ parent, doc: "#book", onChange });

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

        const handled = !editor.contentDOM.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true
        }));

        expect(handled).toBe(true);
        expect(onEnter).toHaveBeenCalledOnce();
        expect(editor.state.doc.toString()).toBe("#book");
    });

    it("collapses line breaks in inserted text, keeping the document on one line", () => {
        const onChange = vi.fn();
        editor = build({ onChange });

        editor.dispatch({ changes: { from: 0, insert: "#book\r\n  #year = 1954\nnote.title *=* a" } });

        expect(editor.state.doc.lines).toBe(1);
        expect(editor.state.doc.toString()).toBe("#book #year = 1954 note.title *=* a");
        expect(onChange).toHaveBeenLastCalledWith("#book #year = 1954 note.title *=* a");
        // The caret stays within the shortened document.
        expect(editor.state.selection.main.head).toBeLessThanOrEqual(editor.state.doc.length);
    });
});

function build(config: Partial<SingleLineEditorConfig> = {}): SingleLineEditor {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    return createSingleLineEditor({ parent, ...config });
}
