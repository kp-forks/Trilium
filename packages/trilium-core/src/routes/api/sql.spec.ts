import { beforeAll, describe, expect, it } from "vitest";

import { createTextNote } from "../../test/api_fixtures";
import { CoreApiTester } from "../../test/api_tester";

/**
 * Drives the shared core SQL routes through {@link CoreApiTester} (no Express),
 * so this spec runs under both the node and standalone (WASM) suites.
 */
let api: CoreApiTester;

interface SchemaTable {
    name: string;
    columns: { name: string; type: string }[];
}

interface ExecuteResult {
    success: boolean;
    results?: unknown[];
    error?: string;
}

describe("SQL API (core)", () => {
    beforeAll(() => {
        api = CoreApiTester.build();
    });

    describe("schema", () => {
        it("returns the database table schema", async () => {
            const res = await api.get<SchemaTable[]>("/api/sql/schema");
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);

            const notesTable = res.body.find((table) => table.name === "notes");
            expect(notesTable).toBeTruthy();
            expect(Array.isArray(notesTable?.columns)).toBe(true);

            const noteIdColumn = notesTable?.columns.find((col) => col.name === "noteId");
            expect(noteIdColumn).toBeTruthy();
        });
    });

    describe("execute", () => {
        it("runs a SELECT query from a note body and returns the rows", async () => {
            const { noteId } = await createTextNote(api, {
                title: "SQL console",
                content: "SELECT noteId FROM notes WHERE noteId = 'root'"
            });

            const res = await api.post<ExecuteResult>(`/api/sql/execute/${noteId}`);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            const results = res.body.results;
            expect(Array.isArray(results)).toBe(true);
            const firstQueryRows = results?.[0] as { noteId: string }[];
            expect(firstQueryRows[0].noteId).toBe("root");
        });

        it("runs multiple statements separated by the query delimiter", async () => {
            const { noteId } = await createTextNote(api, {
                title: "SQL console multi",
                content: "SELECT 1 AS one\n---\nSELECT 2 AS two"
            });

            const res = await api.post<ExecuteResult>(`/api/sql/execute/${noteId}`);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.results).toHaveLength(2);
        });

        it("reports success=false with an error message for an invalid query", async () => {
            const { noteId } = await createTextNote(api, {
                title: "SQL console broken",
                content: "SELECT * FROM this_table_does_not_exist"
            });

            const res = await api.post<ExecuteResult>(`/api/sql/execute/${noteId}`);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(false);
            expect(typeof res.body.error).toBe("string");
        });

        it("404s when the note does not exist", async () => {
            const res = await api.post("/api/sql/execute/missingNote123");
            expect(res.status).toBe(404);
        });
    });
});
