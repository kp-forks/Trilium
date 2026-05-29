import { beforeAll, describe, expect, it } from "vitest";

import { getSql } from "../../services/sql/index";
import { createTextNote } from "../../test/api_fixtures";
import { CoreApiTester } from "../../test/api_tester";

/**
 * Drives the shared core revision routes through {@link CoreApiTester} (no Express),
 * so this spec runs under both the node and standalone (WASM) suites.
 */
let api: CoreApiTester;

interface ForceSaveResponse {
    revisionId: string;
}

/**
 * Creates a fresh note and forces a manual revision on it, returning the
 * note id and the new revision id so tests can read/restore/erase it.
 */
async function createNoteWithRevision(
    options?: { title?: string; content?: string }
): Promise<{ noteId: string; revisionId: string }> {
    const { noteId } = await createTextNote(api, options);
    const res = await api.post<ForceSaveResponse>(`/api/notes/${noteId}/revision`, {
        body: { description: "manual snapshot" }
    });
    expect(res.status).toBe(200);
    expect(res.body.revisionId).toBeTruthy();

    return { noteId, revisionId: res.body.revisionId };
}

function revisionExists(revisionId: string): boolean {
    const row = getSql().getRowOrNull<{ revisionId: string }>(
        "SELECT revisionId FROM revisions WHERE revisionId = ?",
        [ revisionId ]
    );
    return row !== null;
}

describe("Revisions API (core)", () => {
    beforeAll(() => {
        api = CoreApiTester.build();
    });

    describe("force-saving a revision", () => {
        it("creates a revision for an existing note", async () => {
            const { noteId } = await createTextNote(api, { title: "Has revisions" });

            const res = await api.post<ForceSaveResponse>(`/api/notes/${noteId}/revision`, {
                body: { description: "first snapshot" }
            });
            expect(res.status).toBe(200);
            expect(res.body.revisionId).toBeTruthy();
        });

        it("404s when the note does not exist", async () => {
            const res = await api.post("/api/notes/missingNote123/revision", {
                body: { description: "nope" }
            });
            expect(res.status).toBe(404);
        });
    });

    describe("reading", () => {
        it("lists revisions for a note", async () => {
            const { noteId, revisionId } = await createNoteWithRevision({ title: "Listed" });

            const res = await api.get<Array<{ revisionId: string; noteId: string }>>(
                `/api/notes/${noteId}/revisions`
            );
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.some((rev) => rev.revisionId === revisionId)).toBe(true);
            expect(res.body[0].noteId).toBe(noteId);
        });

        it("returns an empty list for a note without revisions", async () => {
            const { noteId } = await createTextNote(api, { title: "No revisions" });

            const res = await api.get<unknown[]>(`/api/notes/${noteId}/revisions`);
            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it("returns a single revision by id", async () => {
            const { noteId, revisionId } = await createNoteWithRevision({
                title: "Single",
                content: "<p>snapshot body</p>"
            });

            const res = await api.get<{ revisionId: string; noteId: string; type: string }>(
                `/api/revisions/${revisionId}`
            );
            expect(res.status).toBe(200);
            expect(res.body.revisionId).toBe(revisionId);
            expect(res.body.noteId).toBe(noteId);
            expect(res.body.type).toBeTruthy();
        });

        it("returns the revision blob", async () => {
            const { revisionId } = await createNoteWithRevision({ content: "<p>blob body</p>" });

            const res = await api.get<{ blobId: string; content: string }>(
                `/api/revisions/${revisionId}/blob`
            );
            expect(res.status).toBe(200);
            expect(res.body.blobId).toBeTruthy();
            expect(typeof res.body.content).toBe("string");
            expect(res.body.content).toContain("blob body");
        });

        it("404s for a missing revision", async () => {
            const res = await api.get("/api/revisions/missingRevision123");
            expect(res.status).toBe(404);
        });
    });

    describe("updating the description", () => {
        it("updates an existing revision's description", async () => {
            const { revisionId } = await createNoteWithRevision({ title: "Describe me" });

            const res = await api.patch(`/api/revisions/${revisionId}`, {
                body: { description: "edited description" }
            });
            expect(res.status).toBe(204);

            const row = getSql().getRowOrNull<{ description: string }>(
                "SELECT description FROM revisions WHERE revisionId = ?",
                [ revisionId ]
            );
            expect(row?.description).toBe("edited description");
        });

        it("404s when updating a missing revision", async () => {
            const res = await api.patch("/api/revisions/missingRevision123", {
                body: { description: "whatever" }
            });
            expect(res.status).toBe(404);
        });
    });

    describe("restoring", () => {
        it("restores a revision and creates a new pre-restore snapshot", async () => {
            const { noteId, revisionId } = await createNoteWithRevision({
                title: "Original",
                content: "<p>original body</p>"
            });

            // Mutate the note away from the snapshotted state.
            const update = await api.put(`/api/notes/${noteId}/data`, {
                body: { content: "<p>changed body</p>" }
            });
            expect(update.status).toBe(204);

            const restore = await api.post(`/api/revisions/${revisionId}/restore`);
            expect(restore.status).toBe(204);

            const blob = await api.get<{ content: string }>(`/api/notes/${noteId}/blob`);
            expect(blob.body.content).toContain("original body");

            // Restoring snapshots the pre-restore state, so there is now more than one revision.
            const revisions = await api.get<unknown[]>(`/api/notes/${noteId}/revisions`);
            expect(revisions.body.length).toBeGreaterThan(1);
        });

        it("no-ops for a missing revision", async () => {
            const res = await api.post("/api/revisions/missingRevision123/restore");
            expect(res.status).toBe(204);
        });
    });

    describe("erasing", () => {
        it("erases a single revision", async () => {
            const { revisionId } = await createNoteWithRevision({ title: "Erase one" });
            expect(revisionExists(revisionId)).toBe(true);

            const res = await api.delete(`/api/revisions/${revisionId}`);
            expect(res.status).toBe(204);
            expect(revisionExists(revisionId)).toBe(false);
        });

        it("erases all revisions of a note", async () => {
            const { noteId, revisionId } = await createNoteWithRevision({ title: "Erase all" });
            expect(revisionExists(revisionId)).toBe(true);

            const res = await api.delete(`/api/notes/${noteId}/revisions`);
            expect(res.status).toBe(204);
            expect(revisionExists(revisionId)).toBe(false);

            const list = await api.get<unknown[]>(`/api/notes/${noteId}/revisions`);
            expect(list.body).toEqual([]);
        });
    });

    describe("edited notes on a date", () => {
        it("returns notes edited on the given date", async () => {
            const { noteId } = await createTextNote(api, { title: "Edited today" });

            const row = getSql().getRowOrNull<{ dateModified: string }>(
                "SELECT dateModified FROM notes WHERE noteId = ?",
                [ noteId ]
            );
            const date = (row?.dateModified ?? "").substring(0, 10);
            expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

            const res = await api.get<Array<{ noteId: string; notePath: string[] | null }>>(
                `/api/edited-notes/${date}`
            );
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.some((note) => note.noteId === noteId)).toBe(true);
        });

        it("returns an empty list for a date with no edits", async () => {
            const res = await api.get<unknown[]>("/api/edited-notes/1970-01-01");
            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });
    });
});
