import { describe, expect, it } from "vitest";

import * as cls from "./context.js";
import { getSql } from "./sql/index.js";
import sqlInit from "./sql_init.js";

/**
 * Re-running the sync-from-server setup after a FAILED first attempt (#10548).
 *
 * A failed initial sync leaves the database in a half-way state: the schema and the
 * seed options exist, but `initialized` is still false. The user must be able to go
 * back in the setup wizard, correct the server address/credentials and submit again —
 * which calls createDatabaseForSync a second time. That call must rebuild the database
 * from scratch (the partial pull may contain rows from a *different* server) instead of
 * failing on the already-existing schema.
 *
 * Own spec file: this test intentionally destroys and rebuilds the fixture DB, and the
 * per-file fork isolation keeps that away from every other suite.
 */
describe("createDatabaseForSync on a partially set-up database", () => {
    it("rebuilds the schema and replaces the seed options", async () => {
        const sql = getSql();

        // Turn the (initialized) fixture into the failed-setup state: schema + data
        // present, but the initial sync never converged.
        sql.execute("UPDATE options SET value = 'false' WHERE name = 'initialized'");
        expect(sqlInit.schemaExists()).toBe(true);
        expect(sqlInit.isDbInitialized()).toBe(false);
        const staleNoteCount = sql.getValue<number>("SELECT COUNT(*) FROM notes") ?? 0;
        expect(staleNoteCount).toBeGreaterThan(0);

        // cls.init mirrors the route context this runs under in production.
        await cls.init(() => sqlInit.createDatabaseForSync(
            [
                { name: "documentId", value: "resetup-doc-id", isSynced: true, utcDateModified: "2026-07-18 00:00:00.000Z" },
                { name: "documentSecret", value: "resetup-doc-secret", isSynced: true, utcDateModified: "2026-07-18 00:00:00.000Z" }
            ],
            "http://corrected-server:8080"
        ));

        // The schema is back and pristine: no leftovers from the previous partial pull.
        expect(sqlInit.schemaExists()).toBe(true);
        expect(sql.getValue<number>("SELECT COUNT(*) FROM notes")).toBe(0);

        // The new seed and sync options won.
        expect(sql.getValue<string>("SELECT value FROM options WHERE name = 'documentId'")).toBe("resetup-doc-id");
        expect(sql.getValue<string>("SELECT value FROM options WHERE name = 'documentSecret'")).toBe("resetup-doc-secret");
        expect(sql.getValue<string>("SELECT value FROM options WHERE name = 'syncServerHost'")).toBe("http://corrected-server:8080");
    });
});
