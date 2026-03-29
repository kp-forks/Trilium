/**
 * LLM tools that wrap existing Trilium services.
 * These reuse the same logic as ETAPI without any HTTP overhead.
 */

import { tool } from "ai";
import { z } from "zod";

import becca from "../../becca/becca.js";
import SearchContext from "../search/search_context.js";
import searchService from "../search/services/search.js";

/**
 * Search for notes in the knowledge base.
 */
export const searchNotes = tool({
    description: "Search for notes in the user's knowledge base. Returns note metadata including title, type, and IDs.",
    inputSchema: z.object({
        query: z.string().describe("Search query (supports Trilium search syntax)")
    }),
    execute: async ({ query }) => {
        const searchContext = new SearchContext({});
        const results = searchService.findResultsWithQuery(query, searchContext);

        return results.slice(0, 10).map(sr => {
            const note = becca.notes[sr.noteId];
            if (!note) return null;
            return {
                noteId: note.noteId,
                title: note.title,
                type: note.type
            };
        }).filter(Boolean);
    }
});

/**
 * Read the content of a specific note.
 */
export const readNote = tool({
    description: "Read the full content of a note by its ID. Use search_notes first to find relevant note IDs.",
    inputSchema: z.object({
        noteId: z.string().describe("The ID of the note to read")
    }),
    execute: async ({ noteId }) => {
        const note = becca.getNote(noteId);
        if (!note) {
            return { error: "Note not found" };
        }
        if (note.isProtected) {
            return { error: "Note is protected" };
        }

        const content = note.getContent();
        return {
            noteId: note.noteId,
            title: note.title,
            type: note.type,
            content: typeof content === "string" ? content : "[binary content]"
        };
    }
});

/**
 * Update the content of a note.
 */
export const updateNoteContent = tool({
    description: "Replace the entire content of a note. Use this to completely rewrite a note's content. For text notes, provide HTML content.",
    inputSchema: z.object({
        noteId: z.string().describe("The ID of the note to update"),
        content: z.string().describe("The new content for the note (HTML for text notes, plain text for code notes)")
    }),
    execute: async ({ noteId, content }) => {
        const note = becca.getNote(noteId);
        if (!note) {
            return { error: "Note not found" };
        }
        if (note.isProtected) {
            return { error: "Note is protected and cannot be modified" };
        }
        if (note.type !== "text" && note.type !== "code") {
            return { error: `Cannot update content for note type: ${note.type}` };
        }

        note.setContent(content);
        return {
            success: true,
            noteId: note.noteId,
            title: note.title
        };
    }
});

/**
 * Append content to a note.
 */
export const appendToNote = tool({
    description: "Append content to the end of an existing note. For text notes, the content will be added as a new paragraph.",
    inputSchema: z.object({
        noteId: z.string().describe("The ID of the note to append to"),
        content: z.string().describe("The content to append (HTML for text notes, plain text for code notes)")
    }),
    execute: async ({ noteId, content }) => {
        const note = becca.getNote(noteId);
        if (!note) {
            return { error: "Note not found" };
        }
        if (note.isProtected) {
            return { error: "Note is protected and cannot be modified" };
        }
        if (note.type !== "text" && note.type !== "code") {
            return { error: `Cannot append to note type: ${note.type}` };
        }

        const existingContent = note.getContent();
        if (typeof existingContent !== "string") {
            return { error: "Note has binary content" };
        }

        let newContent: string;
        if (note.type === "text") {
            // For text notes, wrap in paragraph if not already HTML
            const contentToAppend = content.startsWith("<") ? content : `<p>${content}</p>`;
            newContent = existingContent + contentToAppend;
        } else {
            // For code notes, just append with newline
            newContent = existingContent + (existingContent.endsWith("\n") ? "" : "\n") + content;
        }

        note.setContent(newContent);
        return {
            success: true,
            noteId: note.noteId,
            title: note.title
        };
    }
});

/**
 * All available note tools.
 */
export const noteTools = {
    search_notes: searchNotes,
    read_note: readNote,
    update_note_content: updateNoteContent,
    append_to_note: appendToNote
};
