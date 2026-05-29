import { beforeAll, describe, expect, it } from "vitest";

import type { RecentChangeRow } from "@triliumnext/commons";

import { createTextNote } from "../../test/api_fixtures";
import { CoreApiTester } from "../../test/api_tester";

/**
 * Drives the shared core recent-changes route through {@link CoreApiTester}
 * (no Express), so this spec runs under both the node and standalone (WASM)
 * suites against the same seeded demo DB.
 */
let api: CoreApiTester;

describe("Recent changes API (core)", () => {
    beforeAll(() => {
        api = CoreApiTester.build();
    });

    it("returns recent changes for the root ancestor", async () => {
        const res = await api.get<RecentChangeRow[]>("/api/recent-changes/root");

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);

        const first = res.body[0];
        expect(typeof first.noteId).toBe("string");
        expect(typeof first.title).toBe("string");
        expect(typeof first.utcDate).toBe("string");
    });

    it("is sorted by utcDate descending", async () => {
        const res = await api.get<RecentChangeRow[]>("/api/recent-changes/root");

        expect(res.status).toBe(200);
        for (let i = 1; i < res.body.length; i++) {
            expect(res.body[i - 1].utcDate >= res.body[i].utcDate).toBe(true);
        }
    });

    it("includes a freshly created note in the root recent changes", async () => {
        const { noteId } = await createTextNote(api, { title: "Recent change probe" });

        const res = await api.get<RecentChangeRow[]>("/api/recent-changes/root");

        expect(res.status).toBe(200);
        const entry = res.body.find((change) => change.noteId === noteId);
        expect(entry).toBeTruthy();
    });

    it("filters recent changes by a specific ancestor subtree", async () => {
        const parent = await createTextNote(api, { title: "Ancestor parent" });
        const child = await createTextNote(api, {
            parentNoteId: parent.noteId,
            title: "Descendant note"
        });

        const res = await api.get<RecentChangeRow[]>(
            `/api/recent-changes/${parent.noteId}`
        );

        expect(res.status).toBe(200);
        const noteIds = res.body.map((change) => change.noteId);
        expect(noteIds).toContain(child.noteId);
    });

    it("reports canBeUndeleted for a soft-deleted note", async () => {
        const { noteId } = await createTextNote(api, { title: "Soon deleted" });

        const del = await api.delete(`/api/notes/${noteId}`, {
            query: { taskId: "recent-changes-delete", last: "true" }
        });
        expect(del.status).toBe(204);

        const res = await api.get<RecentChangeRow[]>("/api/recent-changes/root");
        expect(res.status).toBe(200);

        const deletedEntries = res.body.filter(
            (change) => change.noteId === noteId && change.current_isDeleted
        );
        expect(deletedEntries.length).toBeGreaterThan(0);
        expect(deletedEntries.every((change) => change.canBeUndeleted === true)).toBe(true);
    });

    it("returns an empty list for a non-existent ancestor", async () => {
        const res = await api.get<RecentChangeRow[]>("/api/recent-changes/missingAncestor123");

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(0);
    });
});
