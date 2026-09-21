import "./SearchStringEditor.css";

import type { SearchLintMessages } from "@triliumnext/codemirror/src/extensions/trilium_search_lint";
import type { FieldEditor } from "@triliumnext/codemirror/src/field_editor";
import type { SearchLintResponse } from "@triliumnext/commons";
import clsx from "clsx";
import { useEffect, useRef } from "preact/hooks";

import { t } from "../../services/i18n";
import server from "../../services/server";
import type { ShortcutHintDefinition } from "../../services/shortcut_hints";
import { useContextualShortcutHints } from "../react/hooks";
import { searchCompletionIcon, searchCompletionReactivates, searchCompletionSource } from "./search_completions";

interface SearchStringEditorProps {
    currentValue: string;
    /** The note `currentValue` belongs to. A change to it replaces the document. */
    noteId: string;
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
    onChange(newValue: string): void;
    /** Runs when Enter is pressed, which the editor treats as "run this search". */
    onEnter(): void;
}

// The keys the field answers, for the contextual shortcut pane (Alt+F1). CodeMirror binds
// Ctrl-Space on every platform, so it is a literal key list rather than a rebindable action.
const SEARCH_STRING_HINTS: ShortcutHintDefinition = [
    {
        titleKey: "search_string.hints.title",
        hints: [
            { keys: ["Ctrl+Space"], labelKey: "search_string.hints.completions" },
            { keys: ["Shift+Enter"], labelKey: "search_string.hints.new_line" },
            { keys: ["Enter"], labelKey: "search_string.hints.run_search" }
        ]
    }
];

/**
 * Edits the `#searchString` of a saved search in a CodeMirror editor. Enter runs the search and
 * Shift-Enter starts a new line, so a long query can be laid out over several of them.
 *
 * CodeMirror loads on demand: `RibbonDefinition` imports the tab holding this component
 * statically, so a static import here would put the editor in the initial bundle.
 */
export default function SearchStringEditor({ currentValue, noteId, placeholder, className, autoFocus, onChange, onEnter }: SearchStringEditorProps) {
    const parentRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<FieldEditor>();
    // The editor is built once, so it reaches the current props through a ref rather than
    // through the closure of the render that created it.
    const propsRef = useRef({ currentValue, onChange, onEnter });
    propsRef.current = { currentValue, onChange, onEnter };
    // Set while the effect below writes `currentValue` into the document, so `onChange` does not
    // report it as an edit the user made.
    const isAdopting = useRef(false);

    useContextualShortcutHints(SEARCH_STRING_HINTS);

    useEffect(() => {
        let editor: FieldEditor | undefined;
        let cancelled = false;

        void Promise.all([
            import("@triliumnext/codemirror/src/field_editor"),
            import("@triliumnext/codemirror/src/extensions/trilium_search_highlighter"),
            import("@triliumnext/codemirror/src/extensions/trilium_search_lint")
        ]).then(([ { createFieldEditor }, { triliumSearchHighlighter }, { triliumSearchLinter } ]) => {
            if (cancelled || !parentRef.current) {
                return;
            }

            editor = createFieldEditor({
                parent: parentRef.current,
                doc: propsRef.current.currentValue,
                placeholder,
                extensions: [ triliumSearchHighlighter, triliumSearchLinter(searchLintMessages(), validateOnServer) ],
                completionSource: searchCompletionSource,
                completionIcon: searchCompletionIcon,
                activateOnCompletion: searchCompletionReactivates,
                onChange: (value) => {
                    if (!isAdopting.current) {
                        propsRef.current.onChange(value);
                    }
                },
                onEnter: () => propsRef.current.onEnter()
            });
            editorRef.current = editor;

            if (autoFocus) {
                editor.focus();
            }
        });

        return () => {
            cancelled = true;
            editor?.destroy();
            editorRef.current = undefined;
        };
        // Builds the editor once; `placeholder` and `autoFocus` are read at that point.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Follows a value that changed outside the editor. Under the same `noteId` a focused editor
    // keeps its document, since the debounced save echoes the typed text back and replacing the
    // document would drop the caret to the end.
    const shownNoteId = useRef(noteId);
    useEffect(() => {
        const editor = editorRef.current;
        const switchedNote = shownNoteId.current !== noteId;
        shownNoteId.current = noteId;

        if (!editor || editor.state.doc.toString() === currentValue || (editor.hasFocus && !switchedNote)) {
            return;
        }

        isAdopting.current = true;
        try {
            editor.dispatch({
                changes: { from: 0, to: editor.state.doc.length, insert: currentValue }
            });
        } finally {
            isAdopting.current = false;
        }
    }, [ currentValue, noteId ]);

    return <div ref={parentRef} className={clsx("search-string-editor form-control tn-input-field", className)} />;
}

/**
 * Asks the engine to read the query without running it, for the faults the rules in the editor do
 * not cover. Only reached once those rules are satisfied, so a query they already object to costs
 * no request.
 */
async function validateOnServer(searchString: string) {
    const { error } = await server.post<SearchLintResponse>("search/lint", { searchString });

    return error;
}

/** Read once the editor is built, so the wording follows a language switched while the app runs. */
function searchLintMessages(): SearchLintMessages {
    return {
        relationNeedsProperty: t("search_lint.relation_needs_property"),
        textNeedsContains: t("search_lint.text_needs_contains"),
        contentNotOrdered: t("search_lint.content_not_ordered"),
        compareTheTitle: t("search_lint.compare_the_title"),
        useOperator: (operator) => t("search_lint.use_operator", { operator })
    };
}
