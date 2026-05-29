import { beforeAll, describe, expect, it } from "vitest";

import { createTextNote } from "../../test/api_fixtures";
import { CoreApiTester } from "../../test/api_tester";

let api: CoreApiTester;

interface AttrRow {
    attributeId: string;
    type: string;
    name: string;
    value: string;
}

describe("Attributes API (core)", () => {
    beforeAll(() => {
        api = CoreApiTester.build();
    });

    describe("reading", () => {
        it("returns the effective attributes of a note", async () => {
            const res = await api.get<AttrRow[]>("/api/notes/_hidden/attributes");
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.some((a) => a.name === "docName")).toBe(true);
        });

        it("returns attribute names filtered by type and query", async () => {
            const res = await api.get("/api/attribute-names", {
                query: { type: "label", query: "" }
            });
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it("400s when type/query params are missing", async () => {
            const res = await api.get("/api/attribute-names");
            expect(res.status).toBe(400);
        });

        it("returns distinct values for an attribute name", async () => {
            const res = await api.get("/api/attribute-values/docName");
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });

    describe("writing", () => {
        it("adds a label, reads it back, then deletes it", async () => {
            const { noteId } = await createTextNote(api);

            const add = await api.post(`/api/notes/${noteId}/attributes`, {
                body: { type: "label", name: "myLabel", value: "myValue" }
            });
            expect(add.status).toBe(204);

            const afterAdd = await api.get<AttrRow[]>(`/api/notes/${noteId}/attributes`);
            const added = afterAdd.body.find((a) => a.name === "myLabel");
            expect(added).toMatchObject({ type: "label", value: "myValue" });

            const del = await api.delete(`/api/notes/${noteId}/attributes/${added!.attributeId}`);
            expect(del.status).toBe(204);

            const afterDelete = await api.get<AttrRow[]>(`/api/notes/${noteId}/attributes`);
            const remainingIds = afterDelete.body.map((a) => a.attributeId);
            expect(remainingIds).not.toContain(added!.attributeId);
        });

        it("sets an attribute idempotently via set-attribute", async () => {
            const { noteId } = await createTextNote(api);

            const first = await api.put(`/api/notes/${noteId}/set-attribute`, {
                body: { type: "label", name: "color", value: "red" }
            });
            expect(first.status).toBe(204);

            await api.put(`/api/notes/${noteId}/set-attribute`, {
                body: { type: "label", name: "color", value: "blue" }
            });

            const res = await api.get<AttrRow[]>(`/api/notes/${noteId}/attributes`);
            const colors = res.body.filter((a) => a.name === "color");
            expect(colors).toHaveLength(1);
            expect(colors[0].value).toBe("blue");
        });

        it("creates a relation between two notes", async () => {
            const { noteId } = await createTextNote(api);

            const res = await api.put<AttrRow>(`/api/notes/${noteId}/relations/myRelation/to/root`);
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ type: "relation", name: "myRelation", value: "root" });
        });
    });
});
