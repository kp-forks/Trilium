import { beforeAll, describe, expect, it } from "vitest";

import {
    type ApiTestContext,
    bootLoggedInApp,
    createTextNote } from "../../../spec/support/internal_api.js";

let ctx: ApiTestContext;
const UNIQUE_TOKEN = "ZzUniqueSearchTokenQwerty";

describe("Search API", () => {
    let createdNoteId: string;

    beforeAll(async () => {
        ctx = await bootLoggedInApp();
        ({ noteId: createdNoteId } = await createTextNote(ctx, { title: UNIQUE_TOKEN }));
    });

    it("returns matching note ids for a full search", async () => {
        const res = await ctx.agent.get(`/api/search/${UNIQUE_TOKEN}`).expect(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toContain(createdNoteId);
    });

    it("returns structured quick-search results with snippets", async () => {
        const res = await ctx.agent.get(`/api/quick-search/${UNIQUE_TOKEN}`).expect(200);
        expect(res.body.searchResultNoteIds).toContain(createdNoteId);
        expect(Array.isArray(res.body.searchResults)).toBe(true);
    });

    it("lists template note ids", async () => {
        const res = await ctx.agent.get("/api/search-templates").expect(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it("400s when searching from a note that is not a search note", async () => {
        await ctx.agent.get("/api/search-note/root").expect(400);
    });

    it("returns related notes for an attribute query", async () => {
        const res = await ctx.agent
            .post("/api/search-related")
            .set("x-csrf-token", ctx.csrfToken)
            .send({ type: "label", name: "docName", value: "hidden" })
            .expect(200);

        expect(typeof res.body.count).toBe("number");
        expect(Array.isArray(res.body.results)).toBe(true);
    });
});
