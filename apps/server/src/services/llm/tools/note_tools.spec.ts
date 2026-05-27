import { becca_easy_mocking } from "@triliumnext/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import becca from "../../../becca/becca.js";
import { noteTools } from "./note_tools.js";
import type { ToolDefinition } from "./tool_registry.js";

const { buildNote } = becca_easy_mocking;

vi.mock("../../notes.js", () => ({
    default: {
        createNewNote: vi.fn()
    }
}));

function getTool(name: string): ToolDefinition {
    for (const [n, def] of noteTools) {
        if (n === name) return def;
    }
    throw new Error(`Tool ${name} not registered`);
}

/**
 * Wire up an in-memory content store on a note so the tool can read back
 * what it just wrote via `setContent`. Also stubs `saveRevision` to a no-op.
 */
function withMutableContent(note: ReturnType<typeof buildNote>, initial: string) {
    let store = initial;
    note.getContent = () => store;
    note.setContent = vi.fn((content: string | Uint8Array) => {
        store = typeof content === "string" ? content : new TextDecoder().decode(content);
    }) as typeof note.setContent;
    note.saveRevision = vi.fn() as typeof note.saveRevision;
}

describe("note_tools — write tools return post-write content", () => {
    beforeEach(() => {
        becca.reset();
        vi.clearAllMocks();
    });

    describe("set_note_content", () => {
        it("returns the new content for code notes", () => {
            const note = buildNote({ id: "code1", type: "code", mime: "text/plain", content: "old" });
            withMutableContent(note, "old");

            const result = getTool("set_note_content").execute({ noteId: "code1", content: "new code" });

            expect(result).toEqual({
                success: true,
                noteId: "code1",
                title: note.title,
                content: "new code"
            });
        });

        it("returns Markdown for text notes (HTML round-trip)", () => {
            const note = buildNote({ id: "text1", type: "text", mime: "text/html", content: "" });
            withMutableContent(note, "");

            const result = getTool("set_note_content").execute({
                noteId: "text1",
                content: "# Heading\n\nBody text"
            }) as { success: true; content: string };

            expect(result.success).toBe(true);
            expect(result.content).toContain("# Heading");
            expect(result.content).toContain("Body text");
        });

        it("returns an error and no content when the note is missing", () => {
            const result = getTool("set_note_content").execute({ noteId: "missing", content: "x" });
            expect(result).toEqual({ error: "Note not found" });
        });
    });

    describe("append_to_note", () => {
        it("returns the combined content for code notes", () => {
            const note = buildNote({ id: "code2", type: "code", mime: "text/plain", content: "first line" });
            withMutableContent(note, "first line");

            const result = getTool("append_to_note").execute({ noteId: "code2", content: "second line" }) as {
                success: true;
                content: string;
            };

            expect(result.success).toBe(true);
            expect(result.content).toBe("first line\nsecond line");
        });
    });

    describe("edit_note_content", () => {
        it("returns the content with edits applied", () => {
            const note = buildNote({
                id: "code3",
                type: "code",
                mime: "text/plain",
                content: "const x = 1;\nconst y = 2;"
            });
            withMutableContent(note, "const x = 1;\nconst y = 2;");

            const result = getTool("edit_note_content").execute({
                noteId: "code3",
                edits: [{ oldText: "const x = 1;", newText: "const x = 42;" }]
            }) as { success: true; content: string };

            expect(result.success).toBe(true);
            expect(result.content).toBe("const x = 42;\nconst y = 2;");
        });

        it("rejects text notes and returns no content field", () => {
            const note = buildNote({ id: "text2", type: "text", content: "<p>hi</p>" });
            withMutableContent(note, "<p>hi</p>");

            const result = getTool("edit_note_content").execute({
                noteId: "text2",
                edits: [{ oldText: "hi", newText: "bye" }]
            });

            expect(result).toMatchObject({ error: expect.stringContaining("does not support rich-text") });
            expect(result).not.toHaveProperty("content");
        });
    });

    describe("create_note", () => {
        it("returns the created note's content", async () => {
            buildNote({ id: "parent1", title: "Parent" });

            const newNote = buildNote({ id: "new1", type: "code", mime: "text/plain", content: "hello" });
            withMutableContent(newNote, "hello");

            const noteService = (await import("../../notes.js")).default;
            vi.mocked(noteService.createNewNote).mockReturnValue({ note: newNote } as ReturnType<typeof noteService.createNewNote>);

            const result = getTool("create_note").execute({
                parentNoteId: "parent1",
                title: "New",
                content: "hello",
                type: "code",
                mime: "text/plain"
            }) as { success: true; noteId: string; content: string };

            expect(result.success).toBe(true);
            expect(result.noteId).toBe("new1");
            expect(result.content).toBe("hello");
        });
    });
});
