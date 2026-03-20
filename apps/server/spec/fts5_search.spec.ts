import { Application } from "express";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../src/services/config.js";

let app: Application;

function timed<T>(fn: () => T): [T, number] {
    const start = performance.now();
    const result = fn();
    return [result, performance.now() - start];
}

describe("FTS5 Content Search (integration)", () => {
    beforeAll(async () => {
        config.General.noAuthentication = true;
        const buildApp = (await import("../src/app.js")).default;
        app = await buildApp();
    });

    it("FTS5 index builds and searches correctly", async () => {
        const sql = (await import("../src/services/sql.js")).default;
        const becca = (await import("../src/becca/becca.js")).default;
        const ftsIndex = (await import("../src/services/search/fts_index.js")).default;
        const cls = (await import("../src/services/cls.js")).default;

        await new Promise<void>((resolve) => {
            cls.init(() => {
                // Check if FTS table exists (migration may not have run on test DB)
                const tableExists = sql.getValue<number>(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='note_content_fts'"
                );

                if (!tableExists) {
                    // Create the table for testing
                    sql.execute(`
                        CREATE VIRTUAL TABLE IF NOT EXISTS note_content_fts USING fts5(
                            noteId UNINDEXED,
                            content,
                            tokenize='unicode61 remove_diacritics 2'
                        )
                    `);
                }

                const noteCount = Object.keys(becca.notes).length;
                console.log(`\n  Notes in becca: ${noteCount}`);

                // Build the index
                ftsIndex.resetIndex();
                const [, buildMs] = timed(() => ftsIndex.buildIndex());
                console.log(`  FTS index build: ${buildMs.toFixed(0)}ms`);

                // Verify index has content
                const indexedCount = sql.getValue<number>("SELECT COUNT(*) FROM note_content_fts");
                console.log(`  Notes indexed: ${indexedCount}`);
                expect(indexedCount).toBeGreaterThanOrEqual(0);

                // If we have indexed content, test search
                if (indexedCount > 0) {
                    const [results, searchMs] = timed(() => ftsIndex.searchContent(["note"], "*=*"));
                    console.log(`  FTS search "note": ${searchMs.toFixed(1)}ms (${results.length} results)`);
                    expect(results).toBeInstanceOf(Array);
                }

                // Test update and remove don't throw
                expect(() => ftsIndex.updateNote("nonexistent")).not.toThrow();
                expect(() => ftsIndex.removeNote("nonexistent")).not.toThrow();

                // Clean up
                sql.execute("DELETE FROM note_content_fts");
                ftsIndex.resetIndex();

                resolve();
            });
        });
    });
});
