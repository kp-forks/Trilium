import { getSql } from "@triliumnext/core";
import { beforeAll, describe, expect, it } from "vitest";

import {
    type ApiTestContext,
    bootLoggedInApp,
    createTextNote } from "../../../spec/support/internal_api.js";

let ctx: ApiTestContext;

function noteIsDeleted(noteId: string): number | null {
    const row = getSql().getRowOrNull<{ isDeleted: number }>(
        "SELECT isDeleted FROM notes WHERE noteId = ?",
        [ noteId ]
    );
    return row ? row.isDeleted : null;
}

describe("Notes API", () => {
    beforeAll(async () => {
        ctx = await bootLoggedInApp();
    });

    describe("reading", () => {
        it("returns note metadata for an existing note", async () => {
            const res = await ctx.agent.get("/api/notes/root").expect(200);
            expect(res.body.noteId).toBe("root");
            expect(res.body.type).toBeTruthy();
        });

        it("returns timestamp metadata", async () => {
            const res = await ctx.agent.get("/api/notes/root/metadata").expect(200);
            expect(res.body).toMatchObject({
                dateCreated: expect.any(String),
                utcDateCreated: expect.any(String),
                dateModified: expect.any(String),
                utcDateModified: expect.any(String)
            });
        });

        it("returns the note blob", async () => {
            const res = await ctx.agent.get("/api/notes/root/blob").expect(200);
            expect(res.body.blobId).toBeTruthy();
            expect(typeof res.body.content).toBe("string");
        });

        it("404s for a missing note", async () => {
            await ctx.agent.get("/api/notes/missingNote123").expect(404);
        });
    });

    describe("creating", () => {
        it("creates a child note under root", async () => {
            const res = await ctx.agent
                .post("/api/notes/root/children?target=into")
                .set("x-csrf-token", ctx.csrfToken)
                .send({ title: "Created via API", type: "text", content: "<p>body</p>" })
                .expect(200);

            expect(res.body.note.noteId).toBeTruthy();
            expect(res.body.note.title).toBe("Created via API");
            expect(res.body.branch.parentNoteId).toBe("root");
        });

        it("400s when the target query param is invalid", async () => {
            await ctx.agent
                .post("/api/notes/root/children")
                .set("x-csrf-token", ctx.csrfToken)
                .send({ title: "no target", type: "text" })
                .expect(400);
        });
    });

    describe("updating", () => {
        it("changes a note title and returns the updated note", async () => {
            const { noteId } = await createTextNote(ctx, { title: "Before" });

            const res = await ctx.agent
                .put(`/api/notes/${noteId}/title`)
                .set("x-csrf-token", ctx.csrfToken)
                .send({ title: "After" })
                .expect(200);

            expect(res.body.title).toBe("After");
        });

        it("updates note content", async () => {
            const { noteId } = await createTextNote(ctx, { content: "<p>old</p>" });

            await ctx.agent
                .put(`/api/notes/${noteId}/data`)
                .set("x-csrf-token", ctx.csrfToken)
                .send({ content: "<p>new</p>" })
                .expect(204);

            const blob = await ctx.agent.get(`/api/notes/${noteId}/blob`).expect(200);
            expect(blob.body.content).toContain("new");
        });
    });

    describe("deleting and undeleting", () => {
        it("soft-deletes a note, then undeletes it", async () => {
            const { noteId } = await createTextNote(ctx, { title: "To delete" });
            expect(noteIsDeleted(noteId)).toBe(0);

            await ctx.agent
                .delete(`/api/notes/${noteId}`)
                .query({ taskId: "test-delete", last: "true" })
                .set("x-csrf-token", ctx.csrfToken)
                .expect(204);
            expect(noteIsDeleted(noteId)).toBe(1);

            await ctx.agent
                .put(`/api/notes/${noteId}/undelete`)
                .set("x-csrf-token", ctx.csrfToken)
                .expect(204);
            expect(noteIsDeleted(noteId)).toBe(0);
        });

        it("400s when deleting without a taskId", async () => {
            const { noteId } = await createTextNote(ctx, { title: "Needs taskId" });
            await ctx.agent
                .delete(`/api/notes/${noteId}`)
                .set("x-csrf-token", ctx.csrfToken)
                .expect(400);
        });
    });
});
