import { beforeAll, describe, expect, it } from "vitest";

import { CoreApiTester } from "../../test/api_tester";

/**
 * Drives the shared core tree routes through the in-process {@link CoreApiTester}
 * (no Express / HTTP server), so this same spec runs under both the node
 * (better-sqlite3) and standalone (sql.js WASM) suites against the seeded demo DB.
 */
let api: CoreApiTester;

interface TreeResponse {
    notes: { noteId: string }[];
    branches: { branchId: string }[];
    attributes: unknown[];
}

describe("Tree API (core)", () => {
    beforeAll(() => {
        api = CoreApiTester.build();
    });

    it("returns notes, branches and attributes rooted at root", async () => {
        const res = await api.get<TreeResponse>("/api/tree");

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.notes)).toBe(true);
        expect(res.body.notes.some((n) => n.noteId === "root")).toBe(true);
        // root always gets the synthetic `none_root` branch (parentNoteId "none").
        expect(res.body.branches.some((b) => b.branchId === "none_root")).toBe(true);
    });

    it("scopes the tree to a subtree via subTreeNoteId", async () => {
        const res = await api.get<TreeResponse>("/api/tree", {
            query: { subTreeNoteId: "_hidden" }
        });
        expect(res.status).toBe(200);
        expect(res.body.notes.some((n) => n.noteId === "_hidden")).toBe(true);
    });

    it("404s for an unknown subtree note", async () => {
        const res = await api.get("/api/tree", { query: { subTreeNoteId: "doesNotExist123" } });
        expect(res.status).toBe(404);
    });

    it("loads an explicit set of note ids", async () => {
        const res = await api.post<TreeResponse>("/api/tree/load", {
            body: { noteIds: [ "root" ] }
        });
        expect(res.status).toBe(200);
        expect(res.body.notes.some((n) => n.noteId === "root")).toBe(true);
    });
});
