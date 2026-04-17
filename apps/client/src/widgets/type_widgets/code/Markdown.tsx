import "./Markdown.css";

import DOMPurify from "dompurify";
import { Marked } from "marked";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import SplitEditor from "../helpers/SplitEditor";
import { TypeWidgetProps } from "../type_widget";

const marked = new Marked({ breaks: true, gfm: true });

export default function Markdown(props: TypeWidgetProps) {
    const [ content, setContent ] = useState("");
    const html = useMemo(() => DOMPurify.sanitize(marked.parse(content) as string), [ content ]);
    const previewRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const split = previewRef.current?.closest(".note-detail-split");
        const preview = split?.querySelector<HTMLElement>(".note-detail-split-preview");
        const editor = split?.querySelector<HTMLElement>(".cm-scroller");
        if (!preview || !editor) return;

        function onScroll() {
            if (!preview || !editor) return;
            const editorMax = editor.scrollHeight - editor.clientHeight;
            const previewMax = preview.scrollHeight - preview.clientHeight;
            if (editorMax <= 0 || previewMax <= 0) return;
            preview.scrollTop = (editor.scrollTop / editorMax) * previewMax;
        }

        editor.addEventListener("scroll", onScroll, { passive: true });
        return () => editor.removeEventListener("scroll", onScroll);
    }, [ html ]);

    return (
        <SplitEditor
            noteType="code"
            {...props}
            onContentChanged={setContent}
            previewContent={(
                <div
                    ref={previewRef}
                    className="markdown-preview"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: html }}
                />
            )}
        />
    );
}
