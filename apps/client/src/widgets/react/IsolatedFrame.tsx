import { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { useLayoutEffect, useRef, useState } from "preact/hooks";

interface IsolatedFrameProps {
    className?: string;
    /** Accessible title for the underlying `<iframe>`. */
    title: string;
    /** CSS injected into the isolated document's `<head>`. Kept in sync on change. */
    css?: string;
    children?: ComponentChildren;
}

/**
 * Renders its children inside a same-origin, `src`-less `<iframe>`, giving them a fully isolated
 * document: none of the host page's stylesheets, `@font-face` declarations or CSS classes leak in,
 * and nothing rendered here leaks out. Children are Preact nodes portalled into the frame's `<body>`,
 * so they stay live and interactive (re-render on prop changes) rather than being a static snapshot.
 *
 * Provide the frame's own styling via {@link IsolatedFrameProps.css}. Because the document has no
 * base URL, any URLs referenced from that CSS must be absolute.
 */
export default function IsolatedFrame({ className, title, css, children }: IsolatedFrameProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [ body, setBody ] = useState<HTMLElement | null>(null);

    // A same-origin, src-less iframe exposes an empty document synchronously once mounted; re-capture
    // on load in case the browser swaps the initial about:blank document.
    const captureBody = () => {
        const nextBody = iframeRef.current?.contentDocument?.body;
        if (nextBody) setBody(nextBody);
    };
    useLayoutEffect(captureBody, []);

    useLayoutEffect(() => {
        const doc = body?.ownerDocument;
        if (!doc) return;
        let style = doc.getElementById("isolated-frame-style") as HTMLStyleElement | null;
        if (!style) {
            style = doc.createElement("style");
            style.id = "isolated-frame-style";
            doc.head.appendChild(style);
        }
        style.textContent = css ?? "";
    }, [ css, body ]);

    return (
        <>
            <iframe ref={iframeRef} className={className} title={title} onLoad={captureBody} />
            {body && createPortal(children, body)}
        </>
    );
}
