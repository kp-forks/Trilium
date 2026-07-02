import type { CKTextEditor, AttributeEditor, EditorConfig, ModelPosition } from "@triliumnext/ckeditor5";
import { useEffect, useImperativeHandle, useRef } from "preact/compat";
import { MutableRef } from "preact/hooks";

export interface CKEditorApi {
    focus(): void;
    /**
     * Imperatively sets the text in the editor.
     *
     * Prefer setting `currentValue` prop where possible.
     *
     * @param text text to set in the editor
     */
    setText(text: string): void;
    /**
     * Appends `text` to the end of the editor as its own block, translating embedded newlines into
     * soft breaks, then leaves two blank lines below it for visual separation with the cursor on the
     * last one, and focuses the editor. Existing content is preserved; an empty editor gets the text
     * at the top with no leading blank.
     *
     * @param text text to append (may contain `\n`)
     */
    appendBlock(text: string): void;
}

interface CKEditorOpts {
    apiRef: MutableRef<CKEditorApi | undefined>;
    currentValue?: string;
    className: string;
    tabIndex?: number;
    config: EditorConfig;
    editor: typeof AttributeEditor;
    disableNewlines?: boolean;
    disableSpellcheck?: boolean;
    onChange?: (newValue?: string) => void;
    onClick?: (e: MouseEvent, pos?: ModelPosition | null) => void;
    onKeyDown?: (e: KeyboardEvent) => void;
    onBlur?: () => void;
    onInitialized?: (editorInstance: CKTextEditor) => void;
}

export default function CKEditor({ apiRef, currentValue, editor, config, disableNewlines, disableSpellcheck, onChange, onClick, onInitialized, ...restProps }: CKEditorOpts) {
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const textEditorRef = useRef<CKTextEditor>(null);
    useImperativeHandle(apiRef, () => {
        return {
            focus() {
                textEditorRef.current?.editing.view.focus();
                textEditorRef.current?.model.change((writer) => {
                    const documentRoot = textEditorRef.current?.editing.model.document.getRoot();
                    if (documentRoot) {
                        writer.setSelection(writer.createPositionAt(documentRoot, "end"));
                    }
                });
            },
            setText(text: string) {
                textEditorRef.current?.setData(text);
            },
            appendBlock(text: string) {
                const editor = textEditorRef.current;
                if (!editor) return;
                editor.model.change((writer) => {
                    const root = editor.model.document.getRoot();
                    if (!root) return;

                    // An untouched editor holds a single empty paragraph — drop it so the quote
                    // starts at the top with no leading blank line.
                    const onlyChild = root.childCount === 1 ? root.getChild(0) : null;
                    if (onlyChild?.is("element", "paragraph") && onlyChild.isEmpty) {
                        writer.remove(onlyChild);
                    }

                    // The text block: one paragraph, its lines joined by soft breaks so the whole
                    // excerpt stays a single block (a bare `writer.insert` keeps it from merging into
                    // the preceding paragraph, giving the blank-line separation we want).
                    const paragraph = writer.createElement("paragraph");
                    text.split("\n").forEach((line, index) => {
                        if (index > 0) writer.appendElement("softBreak", paragraph);
                        if (line.length > 0) writer.appendText(line, paragraph);
                    });
                    writer.insert(paragraph, writer.createPositionAt(root, "end"));

                    // Two trailing empty paragraphs separate the appended block from where the user
                    // types; the cursor lands on the last one.
                    const blankLine = writer.createElement("paragraph");
                    writer.insert(blankLine, writer.createPositionAfter(paragraph));
                    const cursorParagraph = writer.createElement("paragraph");
                    writer.insert(cursorParagraph, writer.createPositionAfter(blankLine));
                    writer.setSelection(cursorParagraph, "in");
                });
                editor.editing.view.focus();
            }
        };
    }, [ editorContainerRef ]);

    useEffect(() => {
        if (!editorContainerRef.current) return;

        editor.create(editorContainerRef.current, config).then((textEditor) => {
            textEditorRef.current = textEditor;

            if (disableNewlines) {
                textEditor.editing.view.document.on(
                    "enter",
                    (event, data) => {
                        // disable entering new line - see https://github.com/ckeditor/ckeditor5/issues/9422
                        data.preventDefault();
                        event.stop();
                    },
                    { priority: "high" }
                );
            }

            if (disableSpellcheck) {
                const documentRoot = textEditor.editing.view.document.getRoot();
                if (documentRoot) {
                    textEditor.editing.view.change((writer) => writer.setAttribute("spellcheck", "false", documentRoot));
                }
            }

            if (onChange) {
                textEditor.model.document.on("change:data", () => {
                    onChange(textEditor.getData())
                });
            }

            if (currentValue) {
                textEditor.setData(currentValue);
            }

            onInitialized?.(textEditor);
        });
    }, []);

    useEffect(() => {
        if (!textEditorRef.current) return;
        textEditorRef.current.setData(currentValue ?? "");
    }, [ currentValue ]);

    return (
        <div
            ref={editorContainerRef}
            onClick={(e) => {
                if (onClick) {
                    const pos = textEditorRef.current?.model.document.selection.getFirstPosition();
                    onClick(e, pos);
                }
            }}
            {...restProps}
        />
    )
}
