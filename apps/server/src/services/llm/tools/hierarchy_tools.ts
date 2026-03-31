/**
 * LLM tools for navigating the note hierarchy (tree structure, branches).
 */

import { tool } from "ai";
import { z } from "zod";

import becca from "../../../becca/becca.js";

/**
 * Get the child notes of a given note.
 */
export const getChildNotes = tool({
    description: "Get the immediate child notes of a note. Returns each child's ID, title, type, and whether it has children of its own. Use noteId 'root' to list top-level notes.",
    inputSchema: z.object({
        noteId: z.string().describe("The ID of the parent note (use 'root' for top-level)")
    }),
    execute: async ({ noteId }) => {
        const note = becca.getNote(noteId);
        if (!note) {
            return { error: "Note not found" };
        }

        return note.getChildNotes().map((child) => ({
            noteId: child.noteId,
            title: child.getTitleOrProtected(),
            type: child.type,
            childCount: child.getChildNotes().length
        }));
    }
});

export const hierarchyTools = {
    get_child_notes: getChildNotes
};
