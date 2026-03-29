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
 * All available note tools.
 */
export const noteTools = {
    search_notes: searchNotes,
    read_note: readNote
};
