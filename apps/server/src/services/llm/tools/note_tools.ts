/**
 * LLM tools for note operations (search, read, create, update, append).
 */

import { z } from "zod";

import type BNote from "../../../becca/entities/bnote.js";
import becca from "../../../becca/becca.js";
import markdownExport from "../../export/markdown.js";
import markdownImport from "../../import/markdown.js";
import noteService from "../../notes.js";
import SearchContext from "../../search/search_context.js";
import searchService from "../../search/services/search.js";
import { defineTools } from "./tool_registry.js";

const CONTENT_PREVIEW_MAX_LENGTH = 500;

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
        contentPreview: getContentPreview(note)
    };
}

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
function setNoteContentFromLlm(note: { type: string; title: string; setContent: (content: string) => void }, content: string) {
    if (note.type === "text") {
        note.setContent(markdownImport.renderToHtml(content, note.title));
    } else {
        note.setContent(content);
    }
}

export const noteTools = defineTools({
    search_notes: {
        description: [
            "Search for notes in the user's knowledge base using Trilium search syntax.",
            "For complex queries (boolean logic, relations, regex, ordering), load the 'search_syntax' skill first via load_skill.",
            "Common patterns:",
            "- Full-text: 'rings tolkien' (notes containing both words)",
            "- By label: '#book', '#status = done', '#year >= 2000'",
            "- By type: 'note.type = code'",
            "- By relation: '~author', '~author.title *= Tolkien'",
            "- Combined: 'tolkien #book' (full-text + label filter)",
            "- Negation: '#!archived' (notes WITHOUT label)"
        ].join(" "),
        inputSchema: z.object({
            query: z.string().describe("Search query in Trilium search syntax"),
            fastSearch: z.boolean().optional().describe("If true, skip content search (only titles and attributes). Faster for large databases."),
            includeArchivedNotes: z.boolean().optional().describe("If true, include archived notes in results."),
            ancestorNoteId: z.string().optional().describe("Limit search to a subtree rooted at this note ID."),
            limit: z.number().optional().describe("Maximum number of results to return. Defaults to 10.")
        }),
        execute: async ({ query, fastSearch, includeArchivedNotes, ancestorNoteId, limit = 10 }) => {
            const searchContext = new SearchContext({
                fastSearch,
                includeArchivedNotes,
                ancestorNoteId
            });
            const results = searchService.findResultsWithQuery(query, searchContext);

            return results.slice(0, limit).map(sr => {
                const note = becca.notes[sr.noteId];
                if (!note) return null;
                return {
                    noteId: note.noteId,
                    title: note.getTitleOrProtected(),
                    type: note.type
                };
            }).filter(Boolean);
        }
    },

    get_note: {
        description: "Get a note's metadata by its ID. Returns title, type, mime, dates, parent/child relationships, attributes, and a short content preview. Use get_note_content for the full content.",
        inputSchema: z.object({
            noteId: z.string().describe("The ID of the note to retrieve")
        }),
        execute: async ({ noteId }) => {
            const note = becca.getNote(noteId);
            if (!note) {
                return { error: "Note not found" };
            }

            return getNoteMeta(note);
        }
    },

    get_note_content: {
        description: "Read the full content of a note by its ID. Use search_notes first to find relevant note IDs. Text notes are returned as Markdown.",
        inputSchema: z.object({
            noteId: z.string().describe("The ID of the note to read")
        }),
        execute: async ({ noteId }) => {
            const note = becca.getNote(noteId);
            if (!note) {
                return { error: "Note not found" };
            }
            if (!note.isContentAvailable()) {
                return { error: "Note is protected" };
            }

            return {
                noteId: note.noteId,
                content: getNoteContentForLlm(note)
            };
        }
    },

    update_note_content: {
        description: "Replace the entire content of a note. Use this to completely rewrite a note's content. For text notes, provide Markdown content.",
        inputSchema: z.object({
            noteId: z.string().describe("The ID of the note to update"),
            content: z.string().describe("The new content for the note (Markdown for text notes, plain text for code notes)")
        }),
        mutates: true,
        execute: async ({ noteId, content }) => {
            const note = becca.getNote(noteId);
            if (!note) {
                return { error: "Note not found" };
            }
            if (!note.isContentAvailable()) {
                return { error: "Note is protected and cannot be modified" };
            }
            if (!note.hasStringContent()) {
                return { error: `Cannot update content for note type: ${note.type}` };
            }

            note.saveRevision();
            setNoteContentFromLlm(note, content);
            return {
                success: true,
                noteId: note.noteId,
                title: note.getTitleOrProtected()
            };
        }
    },

    append_to_note: {
        description: "Append content to the end of an existing note. For text notes, provide Markdown content.",
        inputSchema: z.object({
            noteId: z.string().describe("The ID of the note to append to"),
            content: z.string().describe("The content to append (Markdown for text notes, plain text for code notes)")
        }),
        mutates: true,
        execute: async ({ noteId, content }) => {
            const note = becca.getNote(noteId);
            if (!note) {
                return { error: "Note not found" };
            }
            if (!note.isContentAvailable()) {
                return { error: "Note is protected and cannot be modified" };
            }
            if (!note.hasStringContent()) {
                return { error: `Cannot update content for note type: ${note.type}` };
            }

            const existingContent = note.getContent();
            if (typeof existingContent !== "string") {
                return { error: "Note has binary content" };
            }

            let newContent: string;
            if (note.type === "text") {
                const htmlToAppend = markdownImport.renderToHtml(content, note.getTitleOrProtected());
                newContent = existingContent + htmlToAppend;
            } else {
                newContent = existingContent + (existingContent.endsWith("\n") ? "" : "\n") + content;
            }

            note.saveRevision();
            note.setContent(newContent);
            return {
                success: true,
                noteId: note.noteId,
                title: note.getTitleOrProtected()
            };
        }
    },

    create_note: {
        description: [
            "Create a new note in the user's knowledge base. Returns the created note's ID and title.",
            "Set type to 'text' for rich text notes (content in Markdown) or 'code' for code notes (must also set mime).",
            "Common mime values for code notes:",
            "'application/javascript;env=frontend' (JS frontend),",
            "'application/javascript;env=backend' (JS backend),",
            "'text/jsx' (Preact JSX, preferred for frontend widgets),",
            "'text/css', 'text/html', 'application/json', 'text/x-python', 'text/x-sh'."
        ].join(" "),
        inputSchema: z.object({
            parentNoteId: z.string().describe("The ID of the parent note. Use 'root' for top-level notes."),
            title: z.string().describe("The title of the new note"),
            content: z.string().describe("The content of the note (Markdown for text notes, plain text for code notes)"),
            type: z.enum(["text", "code"]).describe("The type of note to create."),
            mime: z.string().optional().describe("MIME type, REQUIRED for code notes (e.g. 'application/javascript;env=backend', 'text/jsx'). Ignored for text notes.")
        }),
        mutates: true,
        execute: async ({ parentNoteId, title, content, type, mime }) => {
            if (type === "code" && !mime) {
                return { error: "mime is required when creating code notes" };
            }

            const parentNote = becca.getNote(parentNoteId);
            if (!parentNote) {
                return { error: "Parent note not found" };
            }
            if (!parentNote.isContentAvailable()) {
                return { error: "Cannot create note under a protected parent" };
            }

            const htmlContent = type === "text"
                ? markdownImport.renderToHtml(content, title)
                : content;

            try {
                const { note } = noteService.createNewNote({
                    parentNoteId,
                    title,
                    content: htmlContent,
                    type,
                    ...(mime ? { mime } : {})
                });

                return {
                    success: true,
                    noteId: note.noteId,
                    title: note.getTitleOrProtected(),
                    type: note.type
                };
            } catch (err) {
                return { error: err instanceof Error ? err.message : "Failed to create note" };
            }
        }
    },

    get_note_attachments: {
        description: "List all attachments of a note by its ID. Returns metadata for each attachment.",
        inputSchema: z.object({
            noteId: z.string().describe("The ID of the note whose attachments to list")
        }),
        execute: async ({ noteId }) => {
            const note = becca.getNote(noteId);
            if (!note) {
                return { error: "Note not found" };
            }

            return note.getAttachments().map((att) => ({
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
                contentLength: att.contentLength
            }));
        }
    }
});
