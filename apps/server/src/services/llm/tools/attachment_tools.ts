/**
 * LLM tools for attachment operations.
 */

import { z } from "zod";

import becca from "../../../becca/becca.js";
import { defineTools } from "./tool_registry.js";

export const attachmentTools = defineTools({
    get_attachments: {
        description: "List all attachments of a note. Returns metadata such as title, MIME type, role, size, and attachment ID for each attachment.",
        inputSchema: z.object({
            noteId: z.string().describe("The ID of the note whose attachments to list")
        }),
        execute: async ({ noteId }) => {
            const note = becca.getNote(noteId);
            if (!note) {
                return { error: "Note not found" };
            }

            const attachments = note.getAttachments();

            return attachments.map((att) => ({
                attachmentId: att.attachmentId,
                title: att.title,
                role: att.role,
                mime: att.mime,
                contentLength: att.contentLength,
                position: att.position,
                isProtected: !!att.isProtected,
                utcDateModified: att.utcDateModified
            }));
        }
    }
});
