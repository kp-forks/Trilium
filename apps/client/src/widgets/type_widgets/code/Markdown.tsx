import "./Markdown.css";

import VanillaCodeMirror from "@triliumnext/codemirror";
import DOMPurify from "dompurify";
import { Marked, type TokensList } from "marked";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import SplitEditor from "../helpers/SplitEditor";
import { TypeWidgetProps } from "../type_widget";

const marked = new Marked({ breaks: true, gfm: true });

/**
 * Render markdown and tag each top-level block with its 1-indexed source line,
 * so the preview can be scrolled to match the editor. Marked does not emit
 * source positions (markedjs/marked#1267) so we count newlines in `raw` ourselves.
 */
function renderWithSourceLines(src: string): string {
    const tokens = marked.lexer(src);
    let line = 1;
    const parts: string[] = [];
    for (const token of tokens) {
        const startLine = line;
        line += (token.raw.match(/\n/g) ?? []).length;
        if (token.type === "space") continue;
        const sub = [ token ] as unknown as TokensList;
        (sub as TokensList).links = tokens.links;
        parts.push(`<div data-source-line="${startLine}">${marked.parser(sub)}</div>`);
    }
    return parts.join("");
}

export default function Markdown(props: TypeWidgetProps) {
    const [ content, setContent ] = useState("");
    const html = useMemo(() => DOMPurify.sanitize(renderWithSourceLines(content), { ADD_ATTR: [ "data-source-line" ] }), [ content ]);
    const previewRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let rafId = 0;
        let scroller: HTMLElement | null = null;
        let cmEditor: HTMLElement | null = null;
        let preview: HTMLElement | null = null;

        function onScroll() {
            if (!scroller || !cmEditor || !preview) return;
            const view = VanillaCodeMirror.findFromDOM(cmEditor);
            if (!view) return;

            const topLine = view.state.doc.lineAt(view.lineBlockAtHeight(scroller.scrollTop).from).number;

            const blocks = previewRef.current?.querySelectorAll<HTMLElement>("[data-source-line]");
            if (!blocks?.length) return;

            let before: HTMLElement | null = null;
            let after: HTMLElement | null = null;
            for (const el of blocks) {
                const l = parseInt(el.dataset.sourceLine!, 10);
                if (l <= topLine) before = el;
                else { after = el; break; }
            }

            if (!before) { preview.scrollTop = 0; return; }

            const previewTop = preview.getBoundingClientRect().top - preview.scrollTop;
            const beforeOffset = before.getBoundingClientRect().top - previewTop;
            const beforeLine = parseInt(before.dataset.sourceLine!, 10);

            if (!after) { preview.scrollTop = beforeOffset; return; }

            const afterOffset = after.getBoundingClientRect().top - previewTop;
            const afterLine = parseInt(after.dataset.sourceLine!, 10);
            const ratio = (topLine - beforeLine) / (afterLine - beforeLine);
            preview.scrollTop = beforeOffset + (afterOffset - beforeOffset) * ratio;
        }

        function tryAttach() {
            const split = previewRef.current?.closest(".note-detail-split");
            scroller = split?.querySelector<HTMLElement>(".cm-scroller") ?? null;
            cmEditor = split?.querySelector<HTMLElement>(".cm-editor") ?? null;
            preview = split?.querySelector<HTMLElement>(".note-detail-split-preview") ?? null;
            if (!scroller || !cmEditor || !preview) {
                rafId = requestAnimationFrame(tryAttach);
                return;
            }
            scroller.addEventListener("scroll", onScroll, { passive: true });
        }
        tryAttach();

        return () => {
            cancelAnimationFrame(rafId);
            scroller?.removeEventListener("scroll", onScroll);
        };
    }, []);

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
