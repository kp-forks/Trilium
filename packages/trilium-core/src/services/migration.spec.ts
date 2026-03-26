import { describe, expect, it } from "vitest";
import { getContext } from "./context.js";

describe("Migration", () => {
    it("migrates from v214", async () => {
        await new Promise<void>((resolve) => {
            getContext().init(async () => {
                const { getSql, rebuildIntegrationTestDatabase } = (await (import("./sql/index.js")));
                rebuildIntegrationTestDatabase("spec/db/document_v214.db");

                const migration = (await import("./migration.js")).default;
                await migration.migrateIfNecessary();
                expect(getSql().getValue("SELECT count(*) FROM blobs")).toBe(118);
                resolve();
            });
        });
    }, 60_000);
});
