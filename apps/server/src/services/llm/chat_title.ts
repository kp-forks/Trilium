import becca from "../../becca/becca.js";
import { getProvider } from "./index.js";
import log from "../log.js";
import { t } from "i18next";

/**
 * Generate a short descriptive title for a chat note based on the first user message,
 * then rename the note. Only renames if the note still has the default "Chat: ..." title.
 */
export async function generateChatTitle(chatNoteId: string, firstMessage: string): Promise<void> {
    const note = becca.getNote(chatNoteId);
    if (!note) {
        return;
    }

    // Only rename notes that still have the default timestamp-based title
    const defaultPrefix = t("special_notes.llm_chat_prefix");
    if (!note.title.startsWith(defaultPrefix)) {
        return;
    }

    const provider = getProvider();
    const title = await provider.generateTitle(firstMessage);
    if (title) {
        note.title = title;
        note.save();
        log.info(`Auto-renamed chat note ${chatNoteId} to "${title}"`);
    }
}
