import { history, historyKeymap, standardKeymap } from "@codemirror/commands";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";

export interface SingleLineEditorConfig {
    parent: HTMLElement;
    /** Text the editor starts with. */
    doc?: string;
    placeholder?: string;
    /** Extra extensions, such as a highlighter for whatever syntax the value holds. */
    extensions?: Extension[];
    /** Runs after every document change, with the whole text. */
    onChange?(value: string): void;
    /** Runs when Enter is pressed; the key never inserts a line break. */
    onEnter?(): void;
}

/** The editor {@link createSingleLineEditor} returns. */
export type SingleLineEditor = EditorView;

/**
 * Builds a CodeMirror editor for a one-line value: text editing, undo history and wrapped
 * display, and nothing else — no gutter, no language, no autocompletion.
 *
 * It sits apart from the editor in `index.ts` so a consumer that wants a plain input does not
 * load the language, theme and completion machinery a code note needs.
 */
export function createSingleLineEditor(config: SingleLineEditorConfig): SingleLineEditor {
    const extensions: Extension[] = [
        EditorView.lineWrapping,
        collapseLineBreaks,
        history(),
        keymap.of([
            {
                key: "Enter",
                run: () => {
                    config.onEnter?.();
                    return true;
                },
                preventDefault: true
            },
            ...standardKeymap,
            ...historyKeymap
        ]),
        EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                config.onChange?.(update.state.doc.toString());
            }
        }),
        ...(config.extensions ?? [])
    ];

    if (config.placeholder) {
        extensions.push(placeholder(config.placeholder));
    }

    return new EditorView({
        parent: config.parent,
        doc: config.doc ?? "",
        extensions
    });
}

/**
 * Keeps the document on one line. Typing a line break is already impossible because Enter is
 * bound, so this covers text arriving by paste or drop: every run of whitespace holding a line
 * break collapses to a single space.
 */
const collapseLineBreaks = EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || tr.newDoc.lines === 1) {
        return tr;
    }

    const flattened = tr.newDoc.toString().replace(/\s*\n\s*/g, " ");

    return {
        changes: { from: 0, to: tr.startState.doc.length, insert: flattened },
        selection: { anchor: Math.min(tr.newSelection.main.head, flattened.length) }
    };
});
