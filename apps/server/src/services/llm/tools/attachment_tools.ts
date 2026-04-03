/**
 * LLM tools for attachment operations.
 */

import { z } from "zod";

import becca from "../../../becca/becca.js";
import { defineTools } from "./tool_registry.js";

export const attachmentTools = defineTools({
    get_attachment: {
        description: "Get metadata for a single attachment by its ID.",
        inputSchema: z.object({
            attachmentId: z.string().describe("The ID of the attachment to retrieve")
        }),
        execute: async ({ attachmentId }) => {
            const attachment = becca.getAttachment(attachmentId);
            if (!attachment) {
                return { error: "Attachment not found" };
            }

            return {
                attachmentId: attachment.attachmentId,
                ownerId: attachment.ownerId,
                role: attachment.role,
                mime: attachment.mime,
                title: attachment.title,
                position: attachment.position,
                blobId: attachment.blobId,
                dateModified: attachment.dateModified,
                utcDateModified: attachment.utcDateModified,
                utcDateScheduledForErasureSince: attachment.utcDateScheduledForErasureSince,
                contentLength: attachment.contentLength
            };
        }
    }
});
