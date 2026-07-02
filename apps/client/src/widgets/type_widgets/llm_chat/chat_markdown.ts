import { CustomMarkdownRenderer, renderToHtml } from "@triliumnext/commons/src/lib/markdown_renderer";
import DOMPurify from "dompurify";
import type { Tokens } from "marked";

/**
 * Renderer that tags `#root/...` markdown links with the `reference-link` class
 * so ReadOnlyTextContent's applyReferenceLinks pass decorates them with the
 * note icon, color, and title — same shape as the `[[noteId]]` wiki-link
 * extension's output, but for chat's `[Title](#root/noteId)` references.
 */
class ChatMarkdownRenderer extends CustomMarkdownRenderer {
    override link(token: Tokens.Link): string {
        const html = super.link(token);
        if (token.href.startsWith("#root/")) {
            return html.replace(/^<a\b/, '<a class="reference-link"');
        }
        return html;
    }
}

/**
 * Parse chat markdown to HTML using the shared rendering pipeline. The output is CKEditor's storage
 * form (math as `math-tex` spans, mermaid as `language-mermaid` code blocks, plain code blocks,
 * `reference-link` anchors), so it renders identically in the chat timeline and in a saved text note.
 */
export function renderMarkdown(markdown: string): string {
    return renderToHtml(markdown, "", {
        sanitize: (h) => DOMPurify.sanitize(h),
        wikiLink: { formatHref: (id) => `#root/${id}` },
        demoteH1: false,
        renderer: new ChatMarkdownRenderer({ async: false })
    });
}
