import "./SearchStringEditor.css";

import type { SingleLineEditor } from "@triliumnext/codemirror/src/single_line";
import clsx from "clsx";
import { useEffect, useRef } from "preact/hooks";

interface SearchStringEditorProps {
    currentValue: string;
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
export default function SearchStringEditor({ currentValue, placeholder, className, autoFocus, onChange, onEnter }: SearchStringEditorProps) {
    const parentRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<SingleLineEditor>();
    // The editor is built once, so it reaches the current props through a ref rather than
    // through the closure of the render that created it.
    const propsRef = useRef({ currentValue, onChange, onEnter });
    propsRef.current = { currentValue, onChange, onEnter };

    useEffect(() => {
        let editor: SingleLineEditor | undefined;
        let cancelled = false;

        void Promise.all([
            import("@triliumnext/codemirror/src/single_line"),
            import("@triliumnext/codemirror/src/extensions/trilium_search_highlighter")
        ]).then(([ { createSingleLineEditor }, { triliumSearchHighlighter } ]) => {
            if (cancelled || !parentRef.current) {
                return;
            }

            editor = createSingleLineEditor({
                parent: parentRef.current,
                doc: propsRef.current.currentValue,
                placeholder,
                extensions: [ triliumSearchHighlighter ],
                onChange: (value) => propsRef.current.onChange(value),
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

    // Follows a value that changed outside the editor, such as the ribbon switching to another
    // search note. A focused editor is left alone: the debounced save echoes the typed text back
    // as `currentValue`, and replacing the document would drop the caret to the end.
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor || editor.hasFocus || editor.state.doc.toString() === currentValue) {
            return;
        }

        editor.dispatch({
            changes: { from: 0, to: editor.state.doc.length, insert: currentValue }
        });
    }, [ currentValue ]);

    return <div ref={parentRef} className={clsx("search-string-editor form-control tn-input-field", className)} />;
}
