import { beforeAll, describe, expect, it } from "vitest";

import { getSql } from "../../services/sql/index";
import { createTextNote } from "../../test/api_fixtures";
import { CoreApiTester } from "../../test/api_tester";

/**
 * Drives the shared core recent-notes route through {@link CoreApiTester} (no
 * Express), so this spec runs under both the node and standalone (WASM) suites.
 */
let api: CoreApiTester;

function getRecentNote(noteId: string): { notePath: string; utcDateCreated: string } | null {
    return getSql().getRowOrNull<{ notePath: string; utcDateCreated: string }>(
        "SELECT notePath, utcDateCreated FROM recent_notes WHERE noteId = ?",
        [ noteId ]
    );
}

describe("Recent notes API (core)", () => {
    beforeAll(() => {
        api = CoreApiTester.build();
    });

    it("records a recent note and persists it to the DB", async () => {
        const { noteId } = await createTextNote(api, { title: "Recently visited" });
        const notePath = `root/${noteId}`;

        const res = await api.post("/api/recent-notes", {
            body: { noteId, notePath }
        });
        expect(res.status).toBe(204);
        expect(res.body).toBeUndefined();

        const row = getRecentNote(noteId);
        expect(row).not.toBeNull();
        expect(row?.notePath).toBe(notePath);
        expect(row?.utcDateCreated).toBeTruthy();
    });

    it("upserts on the noteId primary key when the same note is revisited", async () => {
        const { noteId } = await createTextNote(api, { title: "Revisited" });

        const first = await api.post("/api/recent-notes", {
            body: { noteId, notePath: `root/${noteId}` }
        });
        expect(first.status).toBe(204);

        const updatedPath = `root/otherParent/${noteId}`;
        const second = await api.post("/api/recent-notes", {
            body: { noteId, notePath: updatedPath }
        });
        expect(second.status).toBe(204);

        const row = getRecentNote(noteId);
        expect(row?.notePath).toBe(updatedPath);

        const count = getSql().getValue<number>(
            "SELECT COUNT(*) FROM recent_notes WHERE noteId = ?",
            [ noteId ]
        );
        expect(count).toBe(1);
    });
});
