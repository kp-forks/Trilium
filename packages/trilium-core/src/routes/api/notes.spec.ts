import { beforeAll, describe, expect, it } from "vitest";

import { getSql } from "../../services/sql/index";
import { createTextNote } from "../../test/api_fixtures";
import { CoreApiTester } from "../../test/api_tester";

/**
 * Drives the shared core note routes through {@link CoreApiTester} (no Express),
 * so this spec runs under both the node and standalone (WASM) suites.
 */
let api: CoreApiTester;

function noteIsDeleted(noteId: string): number | null {
    const row = getSql().getRowOrNull<{ isDeleted: number }>(
        "SELECT isDeleted FROM notes WHERE noteId = ?",
        [ noteId ]
    );
    return row ? row.isDeleted : null;
}

describe("Notes API (core)", () => {
    beforeAll(() => {
        api = CoreApiTester.build();
    });

    describe("reading", () => {
        it("returns note metadata for an existing note", async () => {
            const res = await api.get<{ noteId: string; type: string }>("/api/notes/root");
            expect(res.status).toBe(200);
            expect(res.body.noteId).toBe("root");
            expect(res.body.type).toBeTruthy();
        });

        it("returns timestamp metadata", async () => {
            const res = await api.get("/api/notes/root/metadata");
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                dateCreated: expect.any(String),
                utcDateCreated: expect.any(String),
                dateModified: expect.any(String),
                utcDateModified: expect.any(String)
            });
        });

        it("returns the note blob", async () => {
            const res = await api.get<{ blobId: string; content: string }>("/api/notes/root/blob");
            expect(res.status).toBe(200);
            expect(res.body.blobId).toBeTruthy();
            expect(typeof res.body.content).toBe("string");
        });

        it("404s for a missing note", async () => {
            const res = await api.get("/api/notes/missingNote123");
            expect(res.status).toBe(404);
        });
    });

    describe("creating", () => {
        it("creates a child note under root", async () => {
            interface CreateResponse {
                note: { noteId: string; title: string };
                branch: { parentNoteId: string };
            }
            const res = await api.post<CreateResponse>(
                "/api/notes/root/children?target=into",
                { body: { title: "Created via API", type: "text", content: "<p>body</p>" } }
            );

            expect(res.status).toBe(200);
            expect(res.body.note.noteId).toBeTruthy();
            expect(res.body.note.title).toBe("Created via API");
            expect(res.body.branch.parentNoteId).toBe("root");
        });

        it("400s when the target query param is invalid", async () => {
            const res = await api.post("/api/notes/root/children", {
                body: { title: "no target", type: "text" }
            });
            expect(res.status).toBe(400);
        });
    });

    describe("updating", () => {
        it("changes a note title and returns the updated note", async () => {
            const { noteId } = await createTextNote(api, { title: "Before" });

            const res = await api.put<{ title: string }>(`/api/notes/${noteId}/title`, {
                body: { title: "After" }
            });
            expect(res.status).toBe(200);
            expect(res.body.title).toBe("After");
        });

        it("updates note content", async () => {
            const { noteId } = await createTextNote(api, { content: "<p>old</p>" });

            const update = await api.put(`/api/notes/${noteId}/data`, {
                body: { content: "<p>new</p>" }
            });
            expect(update.status).toBe(204);

            const blob = await api.get<{ content: string }>(`/api/notes/${noteId}/blob`);
            expect(blob.body.content).toContain("new");
        });
    });

    describe("deleting and undeleting", () => {
        it("soft-deletes a note, then undeletes it", async () => {
            const { noteId } = await createTextNote(api, { title: "To delete" });
            expect(noteIsDeleted(noteId)).toBe(0);

            const del = await api.delete(`/api/notes/${noteId}`, {
                query: { taskId: "test-delete", last: "true" }
            });
            expect(del.status).toBe(204);
            expect(noteIsDeleted(noteId)).toBe(1);

            const undel = await api.put(`/api/notes/${noteId}/undelete`);
            expect(undel.status).toBe(204);
            expect(noteIsDeleted(noteId)).toBe(0);
        });

        it("400s when deleting without a taskId", async () => {
            const { noteId } = await createTextNote(api, { title: "Needs taskId" });
            const res = await api.delete(`/api/notes/${noteId}`);
            expect(res.status).toBe(400);
        });
    });
});
