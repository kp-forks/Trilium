import { beforeAll, describe, expect, it } from "vitest";

import { createTextNote } from "../../test/api_fixtures";
import { CoreApiTester } from "../../test/api_tester";

/**
 * Drives the shared core relation-map route through {@link CoreApiTester} (no Express),
 * so this spec runs under both the node and standalone (WASM) suites.
 */
let api: CoreApiTester;

interface RelationMapResponse {
    noteTitles: Record<string, string>;
    relations: Array<{
        attributeId: string;
        sourceNoteId: string;
        targetNoteId: string;
        name: string;
    }>;
    inverseRelations: Record<string, string>;
}

describe("Relation Map API (core)", () => {
    beforeAll(() => {
        api = CoreApiTester.build();
    });

    it("returns the default empty response when no note ids are supplied", async () => {
        const res = await api.post<RelationMapResponse>("/api/relation-map", {
            body: { relationMapNoteId: "root", noteIds: [] }
        });

        expect(res.status).toBe(200);
        expect(res.body.noteTitles).toEqual({});
        expect(res.body.relations).toEqual([]);
        expect(res.body.inverseRelations.internalLink).toBe("internalLink");
    });

    it("returns the default empty response when note ids are omitted", async () => {
        const res = await api.post<RelationMapResponse>("/api/relation-map", {
            body: { relationMapNoteId: "root" }
        });

        expect(res.status).toBe(200);
        expect(res.body.relations).toEqual([]);
        expect(res.body.inverseRelations.internalLink).toBe("internalLink");
    });

    it("maps titles and relations between the supplied notes", async () => {
        const map = await createTextNote(api, { title: "Map" });
        const source = await createTextNote(api, { title: "Source" });
        const target = await createTextNote(api, { title: "Target" });

        const rel = await api.put(
            `/api/notes/${source.noteId}/relations/links/to/${target.noteId}`
        );
        expect(rel.status).toBe(200);

        const res = await api.post<RelationMapResponse>("/api/relation-map", {
            body: {
                relationMapNoteId: map.noteId,
                noteIds: [ source.noteId, target.noteId ]
            }
        });

        expect(res.status).toBe(200);
        expect(res.body.noteTitles[source.noteId]).toBe("Source");
        expect(res.body.noteTitles[target.noteId]).toBe("Target");

        const mapped = res.body.relations.find(
            (relation) => relation.sourceNoteId === source.noteId
        );
        expect(mapped).toMatchObject({
            sourceNoteId: source.noteId,
            targetNoteId: target.noteId,
            name: "links"
        });
        expect(mapped?.attributeId).toBeTruthy();
    });

    it("omits relations whose target is not part of the requested note ids", async () => {
        const map = await createTextNote(api, { title: "Map" });
        const source = await createTextNote(api, { title: "Source" });
        const target = await createTextNote(api, { title: "Target" });

        const rel = await api.put(
            `/api/notes/${source.noteId}/relations/links/to/${target.noteId}`
        );
        expect(rel.status).toBe(200);

        const res = await api.post<RelationMapResponse>("/api/relation-map", {
            body: {
                relationMapNoteId: map.noteId,
                noteIds: [ source.noteId ]
            }
        });

        expect(res.status).toBe(200);
        expect(res.body.relations).toEqual([]);
    });

    it("404s when the relation map note does not exist", async () => {
        const { noteId } = await createTextNote(api, { title: "Source" });

        const res = await api.post("/api/relation-map", {
            body: { relationMapNoteId: "missingNote123", noteIds: [ noteId ] }
        });

        expect(res.status).toBe(404);
    });
});
