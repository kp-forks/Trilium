import { beforeAll, describe, expect, it } from "vitest";

import { type ApiTestContext,bootLoggedInApp } from "../../../spec/support/internal_api.js";

let ctx: ApiTestContext;

interface TreeResponse {
    notes: { noteId: string }[];
    branches: { branchId: string }[];
    attributes: unknown[];
}

describe("Tree API", () => {
    beforeAll(async () => {
        ctx = await bootLoggedInApp();
    });

    it("returns notes, branches and attributes rooted at root", async () => {
        const res = await ctx.agent.get("/api/tree").expect(200);
        const body = res.body as TreeResponse;

        expect(Array.isArray(body.notes)).toBe(true);
        expect(Array.isArray(body.branches)).toBe(true);
        expect(Array.isArray(body.attributes)).toBe(true);
        expect(body.notes.some((n) => n.noteId === "root")).toBe(true);
        // root always gets the synthetic `none_root` branch (parentNoteId "none").
        expect(body.branches.some((b) => b.branchId === "none_root")).toBe(true);
    });

    it("scopes the tree to a subtree via subTreeNoteId", async () => {
        const res = await ctx.agent
            .get("/api/tree")
            .query({ subTreeNoteId: "_hidden" })
            .expect(200);
        const body = res.body as TreeResponse;
        expect(body.notes.some((n) => n.noteId === "_hidden")).toBe(true);
    });

    it("404s for an unknown subtree note", async () => {
        await ctx.agent.get("/api/tree").query({ subTreeNoteId: "doesNotExist123" }).expect(404);
    });

    it("loads an explicit set of note ids", async () => {
        const res = await ctx.agent
            .post("/api/tree/load")
            .set("x-csrf-token", ctx.csrfToken)
            .send({ noteIds: [ "root" ] })
            .expect(200);
        const body = res.body as TreeResponse;

        expect(body.notes.some((n) => n.noteId === "root")).toBe(true);
    });

    it("rejects a mutating request without a CSRF token", async () => {
        await ctx.agent.post("/api/tree/load").send({ noteIds: [ "root" ] }).expect(403);
    });
});
