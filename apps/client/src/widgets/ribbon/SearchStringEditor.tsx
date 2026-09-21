import "./SearchStringEditor.css";

import type { SearchLintMessages } from "@triliumnext/codemirror/src/extensions/trilium_search_lint";
import type { SingleLineEditor } from "@triliumnext/codemirror/src/single_line";
import clsx from "clsx";
import { useEffect, useRef } from "preact/hooks";

import { t } from "../../services/i18n";
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

/**
 * Edits the `#searchString` of a saved search in a one-line CodeMirror editor.
 *
 * CodeMirror loads on demand: `RibbonDefinition` imports the tab holding this component
 * statically, so a static import here would put the editor in the initial bundle.
 */
export default function SearchStringEditor({ currentValue, noteId, placeholder, className, autoFocus, onChange, onEnter }: SearchStringEditorProps) {
    const parentRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<SingleLineEditor>();
    // The editor is built once, so it reaches the current props through a ref rather than
    // through the closure of the render that created it.
    const propsRef = useRef({ currentValue, onChange, onEnter });
    propsRef.current = { currentValue, onChange, onEnter };
    // Set while the effect below writes `currentValue` into the document, so `onChange` does not
    // report it as an edit the user made.
    const isAdopting = useRef(false);

    useEffect(() => {
        let editor: SingleLineEditor | undefined;
        let cancelled = false;

        void Promise.all([
            import("@triliumnext/codemirror/src/single_line"),
            import("@triliumnext/codemirror/src/extensions/trilium_search_highlighter"),
            import("@triliumnext/codemirror/src/extensions/trilium_search_lint")
        ]).then(([ { createSingleLineEditor }, { triliumSearchHighlighter }, { triliumSearchLinter } ]) => {
            if (cancelled || !parentRef.current) {
                return;
            }

            editor = createSingleLineEditor({
                parent: parentRef.current,
                doc: propsRef.current.currentValue,
                placeholder,
                extensions: [ triliumSearchHighlighter, triliumSearchLinter(searchLintMessages()) ],
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
