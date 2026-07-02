import { t } from "../../../services/i18n.js";
import note_create from "../../../services/note_create.js";
import toast from "../../../services/toast.js";
import { renderMarkdown } from "./chat_markdown.js";
import { stripQuoteSources } from "./chat_quote.js";

/**
 * Whether the "Save to sub-note" command should be offered for a right-clicked message: only in a
 * note chat (a note to parent under), only with no active text selection (a selection means the
 * selection commands apply, and a whole-message save would be confusing), and only when the message
 * actually has text to save.
 */
export function canSaveToSubNote(notePath: string | null | undefined, hasSelection: boolean, markdown: string): boolean {
    return !!notePath && !hasSelection && markdown.trim().length > 0;
}

/**
 * Create a text child note from a message's markdown under `parentNotePath` and open it in the active
 * tab. The content is rendered from the message's markdown source (not scraped from the rendered chat
 * DOM), so it lands in CKEditor's storage form — math, mermaid diagrams, and code survive intact.
 * Quote attribution lines are stripped (their message-id anchors are meaningless outside the chat).
 * The note is created untitled with the title field focused, so the user names it themselves.
 */
export async function saveMessageToSubNote(parentNotePath: string, markdown: string) {
    try {
        const content = renderMarkdown(stripQuoteSources(markdown));
        await note_create.createNote(parentNotePath, { content, type: "text", focus: "title" });
    } catch (e) {
        console.error("Failed to create sub-note from message:", e);
        toast.showError(t("llm_chat.save_to_subnote_failed"));
    }
}
