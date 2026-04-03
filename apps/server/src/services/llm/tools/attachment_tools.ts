/**
 * LLM tools for attachment operations.
 */

import { z } from "zod";

import becca from "../../../becca/becca.js";
import mappers from "../../../etapi/mappers.js";
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

            return mappers.mapAttachmentToPojo(attachment);
        }
    }
});
