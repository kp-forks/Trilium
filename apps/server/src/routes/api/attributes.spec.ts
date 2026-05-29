import { beforeAll, describe, expect, it } from "vitest";

import {
    type ApiTestContext,
    bootLoggedInApp,
    createTextNote } from "../../../spec/support/internal_api.js";

let ctx: ApiTestContext;

interface AttrRow {
    attributeId: string;
    type: string;
    name: string;
    value: string;
}

describe("Attributes API", () => {
    beforeAll(async () => {
        ctx = await bootLoggedInApp();
    });

    describe("reading", () => {
        it("returns the effective attributes of a note", async () => {
            const res = await ctx.agent.get("/api/notes/_hidden/attributes").expect(200);
            const attrs = res.body as AttrRow[];
            expect(Array.isArray(attrs)).toBe(true);
            expect(attrs.some((a) => a.name === "docName")).toBe(true);
        });

        it("returns attribute names filtered by type and query", async () => {
            const res = await ctx.agent
                .get("/api/attribute-names")
                .query({ type: "label", query: "" })
                .expect(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it("400s when type/query params are missing", async () => {
            await ctx.agent.get("/api/attribute-names").expect(400);
        });

        it("returns distinct values for an attribute name", async () => {
            const res = await ctx.agent.get("/api/attribute-values/docName").expect(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });

    describe("writing", () => {
        it("adds a label, reads it back, then deletes it", async () => {
            const { noteId } = await createTextNote(ctx);

            await ctx.agent
                .post(`/api/notes/${noteId}/attributes`)
                .set("x-csrf-token", ctx.csrfToken)
                .send({ type: "label", name: "myLabel", value: "myValue" })
                .expect(204);

            const afterAdd = await ctx.agent.get(`/api/notes/${noteId}/attributes`).expect(200);
            const added = (afterAdd.body as AttrRow[]).find((a) => a.name === "myLabel");
            expect(added).toMatchObject({ type: "label", value: "myValue" });

            await ctx.agent
                .delete(`/api/notes/${noteId}/attributes/${added!.attributeId}`)
                .set("x-csrf-token", ctx.csrfToken)
                .expect(204);

            const afterDelete = await ctx.agent.get(`/api/notes/${noteId}/attributes`).expect(200);
            const remainingIds = (afterDelete.body as AttrRow[]).map((a) => a.attributeId);
            expect(remainingIds).not.toContain(added!.attributeId);
        });

        it("sets an attribute idempotently via set-attribute", async () => {
            const { noteId } = await createTextNote(ctx);

            await ctx.agent
                .put(`/api/notes/${noteId}/set-attribute`)
                .set("x-csrf-token", ctx.csrfToken)
                .send({ type: "label", name: "color", value: "red" })
                .expect(204);

            await ctx.agent
                .put(`/api/notes/${noteId}/set-attribute`)
                .set("x-csrf-token", ctx.csrfToken)
                .send({ type: "label", name: "color", value: "blue" })
                .expect(204);

            const res = await ctx.agent.get(`/api/notes/${noteId}/attributes`).expect(200);
            const colors = (res.body as AttrRow[]).filter((a) => a.name === "color");
            expect(colors).toHaveLength(1);
            expect(colors[0].value).toBe("blue");
        });

        it("creates a relation between two notes", async () => {
            const { noteId } = await createTextNote(ctx);

            const res = await ctx.agent
                .put(`/api/notes/${noteId}/relations/myRelation/to/root`)
                .set("x-csrf-token", ctx.csrfToken)
                .expect(200);

            expect(res.body).toMatchObject({ type: "relation", name: "myRelation", value: "root" });
        });
    });
});
