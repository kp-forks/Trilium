/**
 * Shared helpers for LLM tools — content conversion, metadata building, and previews.
 */

import type BAttachment from "../../../becca/entities/battachment.js";
import type BNote from "../../../becca/entities/bnote.js";
import becca from "../../../becca/becca.js";
import markdownExport from "../../export/markdown.js";
import markdownImport from "../../import/markdown.js";

const CONTENT_PREVIEW_MAX_LENGTH = 500;
const ATTACHMENT_PREVIEW_MAX_LENGTH = 200;

/**
 * Convert note content to a format suitable for LLM consumption.
 * Text notes are converted from HTML to Markdown to reduce token usage.
 */
export function getNoteContentForLlm(note: { type: string; blobId?: string; getContent: () => string | Buffer }) {
    const content = note.getContent();
    if (typeof content !== "string") {
        // For binary content (images, files), use extracted text if available.
        const blob = note.blobId ? becca.getBlob({ blobId: note.blobId }) : null;
        if (blob?.textRepresentation) {
            return `[extracted text from ${note.type}]\n${blob.textRepresentation}`;
        }
        return "[binary content]";
    }
    if (note.type === "text") {
        return markdownExport.toMarkdown(content);
    }
    return content;
}

/**
 * Convert LLM-provided content to a format suitable for storage.
 * For text notes, converts Markdown to HTML.
 */
export function setNoteContentFromLlm(note: { type: string; title: string; setContent: (content: string) => void }, content: string) {
    if (note.type === "text") {
        note.setContent(markdownImport.renderToHtml(content, note.title));
    } else {
        note.setContent(content);
    }
}

/**
 * Return a short plain-text content preview for a note, truncated to
 * {@link CONTENT_PREVIEW_MAX_LENGTH} characters. Useful for giving an LLM a
 * glimpse of the content without sending the full body.
 */
export function getContentPreview(note: { type: string; blobId?: string; getContent: () => string | Buffer; isContentAvailable: () => boolean }): string | null {
    if (!note.isContentAvailable()) {
        return null;
    }

    const full = getNoteContentForLlm(note);
    if (!full || full === "[binary content]") {
        return null;
    }

    if (full.length <= CONTENT_PREVIEW_MAX_LENGTH) {
        return full;
    }

    return `${full.slice(0, CONTENT_PREVIEW_MAX_LENGTH)}…`;
}

/**
 * Return a short content preview for an attachment, or null if no readable
 * content is available. For text attachments the raw content is used; for
 * binary attachments (PDF, images) the OCR/extracted text is used when present.
 */
export function getAttachmentContentPreview(att: BAttachment): string | null {
    let text: string | null = null;

    if (att.hasStringContent()) {
        const content = att.getContent();
        text = typeof content === "string" ? content : content.toString("utf-8");
    } else {
        const blob = att.blobId ? becca.getBlob({ blobId: att.blobId }) : null;
        text = blob?.textRepresentation ?? null;
    }

    if (!text) {
        return null;
    }

    if (text.length <= ATTACHMENT_PREVIEW_MAX_LENGTH) {
        return text;
    }

    return `${text.slice(0, ATTACHMENT_PREVIEW_MAX_LENGTH)}…`;
}

/**
 * Build the full metadata object for a note. Used by both the `get_note` tool
 * and the system prompt.
 */
export function getNoteMeta(note: BNote) {
    return {
        noteId: note.noteId,
        isProtected: note.isProtected,
        title: note.title,
        type: note.type,
        mime: note.mime,
        blobId: note.blobId,
        dateCreated: note.dateCreated,
        dateModified: note.dateModified,
        utcDateCreated: note.utcDateCreated,
        utcDateModified: note.utcDateModified,
        parentNoteIds: note.getParentNotes().map((p) => p.noteId),
        childNoteIds: note.getChildNotes().map((ch) => ch.noteId),
        parentBranchIds: note.getParentBranches().map((p) => p.branchId),
        childBranchIds: note.getChildBranches().map((ch) => ch.branchId),
        attributes: note.getAttributes().map((attr) => ({
            attributeId: attr.attributeId,
            noteId: attr.noteId,
            type: attr.type,
            name: attr.name,
            value: attr.value,
            position: attr.position,
            isInheritable: attr.isInheritable,
            utcDateModified: attr.utcDateModified
        })),
        contentPreview: getContentPreview(note),
        attachments: note.getAttachments().map((att) => ({
            attachmentId: att.attachmentId,
            ownerId: att.ownerId,
            role: att.role,
            mime: att.mime,
            title: att.title,
            position: att.position,
            blobId: att.blobId,
            dateModified: att.dateModified,
            utcDateModified: att.utcDateModified,
            utcDateScheduledForErasureSince: att.utcDateScheduledForErasureSince,
            contentLength: att.contentLength,
            contentPreview: getAttachmentContentPreview(att)
        }))
    };
}
