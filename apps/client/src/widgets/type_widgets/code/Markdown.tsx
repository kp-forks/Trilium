import "./Markdown.css";

import { Marked } from "marked";
import { useMemo, useState } from "preact/hooks";

import { SanitizedHtml } from "../../react/RawHtml";
import SplitEditor from "../helpers/SplitEditor";
import { TypeWidgetProps } from "../type_widget";

const marked = new Marked({ breaks: true, gfm: true });

export default function Markdown(props: TypeWidgetProps) {
    const [ content, setContent ] = useState("");
    const html = useMemo(() => marked.parse(content) as string, [ content ]);

    return (
        <SplitEditor
            noteType="code"
            {...props}
            onContentChanged={setContent}
            previewContent={<SanitizedHtml className="markdown-preview" html={html} />}
        />
    );
}
