import "../markdown/MarkdownCommons.css";
import "./ChatMessage.css";
import "./ChatPreview.css";

import { escapeHtml } from "../../../services/utils.js";
import { renderMarkdown } from "./chat_markdown.js";
import { getMessageText, type StoredMessage } from "./llm_chat_types.js";

/**
 * Renders a stored conversation as a static HTML string, for previews that keep only the serialized
 * markup and never get a chance to unmount a component — currently the note tooltip, which stringifies
 * the rendered content and hands it to Bootstrap. Mounting {@link ChatPreview} there would leave a live
 * Preact root (and its event subscriptions) behind on every hover, so this path trades interactivity
 * for a plain string: the message bubbles and their markdown, no tool cards, attachments, citations or
 * footers. Class names mirror {@link ChatMessage} so the same stylesheets apply.
 *
 * Returns an empty string when there is nothing worth showing, letting the caller fall back to a
 * title-only preview.
 */
export function renderChatPreviewHtml(messages: StoredMessage[]): string {
    const bubbles = messages
        .slice(0, MAX_PREVIEW_MESSAGES)
        .map(renderMessage)
        .filter(Boolean);

    if (!bubbles.length) {
        return "";
    }

    return `<div class="llm-chat-preview">${bubbles.join("")}</div>`;
}

/**
 * A preview is capped so hovering a long conversation doesn't parse hundreds of markdown messages,
 * almost all of them scrolled out of the tooltip's viewport anyway.
 */
const MAX_PREVIEW_MESSAGES = 10;

function renderMessage(message: StoredMessage): string {
    // Thinking blocks are collapsed by default in the live timeline; in a preview they would only
    // push the actual conversation out of view.
    if (message.type === "thinking") {
        return "";
    }

    const text = getMessageText(message.content);
    if (!text.trim()) {
        // Nothing textual to show — e.g. a message carrying only tool calls or attachments.
        return "";
    }

    const wrapperRole = message.role === "user" ? "user" : "assistant";
    const body = message.type === "error"
        ? `<div class="admonition caution llm-chat-error">${escapeHtml(text)}</div>`
        : `<div class="llm-chat-message llm-chat-message-${wrapperRole}">
               <div class="llm-chat-message-content">
                   <div class="ck-content use-tn-links llm-chat-markdown">${renderMarkdown(text)}</div>
               </div>
           </div>`;

    return `<div class="llm-chat-message-wrapper llm-chat-message-wrapper-${wrapperRole}">${body}</div>`;
}
