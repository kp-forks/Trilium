import { autocompletion, type Completion, type CompletionSource } from "@codemirror/autocomplete";
import { history, historyKeymap, standardKeymap } from "@codemirror/commands";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";

/**
 * The types a consumer needs to write a {@link SingleLineEditorConfig.completionSource}, re-exported
 * so it does not have to depend on `@codemirror/autocomplete` itself.
 */
export type { Completion, CompletionContext, CompletionResult, CompletionSource } from "@codemirror/autocomplete";

export interface SingleLineEditorConfig {
    parent: HTMLElement;
    /** Text the editor starts with. */
    doc?: string;
    placeholder?: string;
    /** Extra extensions, such as a highlighter for whatever syntax the value holds. */
    extensions?: Extension[];
    /** Completions to offer as the value is typed. Without one, the editor has no autocompletion. */
    completionSource?: CompletionSource;
    /**
     * The icon classes a completion is drawn with, such as `bx bx-hash`. Completions it answers
     * nothing for are drawn without one; supplying it at all replaces CodeMirror's own icons.
     */
    completionIcon?(completion: Completion): string | undefined;
    /**
     * Whether picking a completion reopens the popup on what follows it, for one that inserts an
     * opening rather than a finished value.
     */
    activateOnCompletion?(completion: Completion): boolean;
    /** Runs after every document change, with the whole text. */
    onChange?(value: string): void;
    /** Runs when Enter is pressed; the key never inserts a line break. */
    onEnter?(): void;
}

/** The editor {@link createSingleLineEditor} returns. */
export type SingleLineEditor = EditorView;

/**
 * Builds a CodeMirror editor for a one-line value: text editing, undo history and wrapped
 * display, and nothing else — no gutter and no language. Highlighting and completion are the
 * consumer's to supply, through `extensions` and `completionSource`.
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

    if (config.completionSource) {
        const icon = config.completionIcon;

        // The completion keymap is registered at the highest precedence, so Enter picks the
        // selected option while the popup is open and reaches `onEnter` the rest of the time.
        extensions.push(autocompletion({
            override: [ config.completionSource ],
            activateOnTyping: true,
            activateOnCompletion: config.activateOnCompletion,
            icons: !icon,
            addToOptions: icon ? [ { position: ICON_POSITION, render: (completion) => renderIcon(icon(completion)) } ] : []
        }));
    }

    return new EditorView({
        parent: config.parent,
        doc: config.doc ?? "",
        extensions
    });
}

/** Where CodeMirror draws its own icons, which {@link SingleLineEditorConfig.completionIcon} takes over. */
const ICON_POSITION = 20;

function renderIcon(classes: string | undefined) {
    if (!classes) {
        return null;
    }

    const element = document.createElement("span");
    element.className = `cm-completion-glyph ${classes}`;
    // The label beside it already says what the icon repeats.
    element.setAttribute("aria-hidden", "true");

    return element;
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
