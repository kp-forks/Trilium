import { beforeAll, describe, expect, it } from "vitest";

import { createTextNote } from "../../test/api_fixtures";
import { CoreApiTester } from "../../test/api_tester";

let api: CoreApiTester;
const UNIQUE_TOKEN = "ZzUniqueSearchTokenQwerty";

describe("Search API (core)", () => {
    let createdNoteId: string;

    beforeAll(async () => {
        api = CoreApiTester.build();
        ({ noteId: createdNoteId } = await createTextNote(api, { title: UNIQUE_TOKEN }));
    });

    it("returns matching note ids for a full search", async () => {
        const res = await api.get<string[]>(`/api/search/${UNIQUE_TOKEN}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toContain(createdNoteId);
    });

    it("returns structured quick-search results with snippets", async () => {
        const res = await api.get<{ searchResultNoteIds: string[]; searchResults: unknown[] }>(
            `/api/quick-search/${UNIQUE_TOKEN}`
        );
        expect(res.status).toBe(200);
        expect(res.body.searchResultNoteIds).toContain(createdNoteId);
        expect(Array.isArray(res.body.searchResults)).toBe(true);
    });

    it("lists template note ids", async () => {
        const res = await api.get("/api/search-templates");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it("400s when searching from a note that is not a search note", async () => {
        const res = await api.get("/api/search-note/root");
        expect(res.status).toBe(400);
    });

    it("returns related notes for an attribute query", async () => {
        const res = await api.post<{ count: number; results: unknown[] }>("/api/search-related", {
            body: { type: "label", name: "docName", value: "hidden" }
        });
        expect(res.status).toBe(200);
        expect(typeof res.body.count).toBe("number");
        expect(Array.isArray(res.body.results)).toBe(true);
    });
});
