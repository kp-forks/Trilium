import { beforeAll, describe, expect, it } from "vitest";

import { CoreApiTester } from "../../test/api_tester";

/**
 * Drives the shared core special-notes routes through {@link CoreApiTester}
 * (no Express), so this spec runs under both the node and standalone (WASM)
 * suites. Date-note GETs lazily create the calendar hierarchy, and the SQL
 * console / search-note POSTs create disposable notes — all safe operations.
 */
let api: CoreApiTester;

interface NotePojo {
    noteId: string;
    type: string;
    title: string;
}

interface CloneResponse {
    success: boolean;
    branchId?: string;
}

describe("Special notes API (core)", () => {
    beforeAll(() => {
        api = CoreApiTester.build();
    });

    describe("date notes", () => {
        it("returns the inbox note for a date", async () => {
            const res = await api.get<NotePojo>("/api/special-notes/inbox/2025-01-01");
            expect(res.status).toBe(200);
            expect(res.body.noteId).toBeTruthy();
            expect(res.body.type).toBeTruthy();
        });

        it("returns (and lazily creates) the day note", async () => {
            const res = await api.get<NotePojo>("/api/special-notes/days/2025-01-01");
            expect(res.status).toBe(200);
            expect(res.body.noteId).toBeTruthy();
            expect(res.body.type).toBeTruthy();
        });

        it("returns the first day of the week for a date", async () => {
            const res = await api.get<NotePojo>("/api/special-notes/week-first-day/2025-01-01");
            expect(res.status).toBe(200);
            expect(res.body.noteId).toBeTruthy();
        });

        it("returns the month note", async () => {
            const res = await api.get<NotePojo>("/api/special-notes/months/2025-01");
            expect(res.status).toBe(200);
            expect(res.body.noteId).toBeTruthy();
        });

        it("returns the quarter note", async () => {
            const res = await api.get<NotePojo>("/api/special-notes/quarters/2025-Q1");
            expect(res.status).toBe(200);
            expect(res.body.noteId).toBeTruthy();
        });

        it("returns the year note", async () => {
            const res = await api.get<NotePojo>("/api/special-notes/years/2025");
            expect(res.status).toBe(200);
            expect(res.body.noteId).toBeTruthy();
        });

        it("returns a map of day notes for a month", async () => {
            await api.get("/api/special-notes/days/2025-01-01");

            const res = await api.get<Record<string, string>>(
                "/api/special-notes/notes-for-month/2025-01"
            );
            expect(res.status).toBe(200);
            expect(typeof res.body).toBe("object");
            expect(res.body["2025-01-01"]).toBeTruthy();
        });

        it("404s for the day note when the calendar root does not exist", async () => {
            const res = await api.get("/api/special-notes/days/2025-01-01", {
                query: { calendarRootId: "missingCalendarRoot123" }
            });
            expect(res.status).toBe(404);
        });
    });

    describe("SQL console", () => {
        it("creates a SQL console note and saves it (round-trip)", async () => {
            const created = await api.post<NotePojo>("/api/special-notes/sql-console");
            expect(created.status).toBe(200);
            expect(created.body.noteId).toBeTruthy();
            expect(created.body.type).toBe("code");

            const saved = await api.post<CloneResponse>("/api/special-notes/save-sql-console", {
                body: { sqlConsoleNoteId: created.body.noteId }
            });
            expect(saved.status).toBe(200);
            expect(saved.body.success).toBe(true);
            expect(saved.body.branchId).toBeTruthy();
        });

        it("500s when saving a non-existent SQL console note", async () => {
            const res = await api.post("/api/special-notes/save-sql-console", {
                body: { sqlConsoleNoteId: "missingSqlConsole123" }
            });
            expect(res.status).toBe(500);
        });
    });

    describe("search notes", () => {
        it("creates a search note and saves it (round-trip)", async () => {
            const created = await api.post<NotePojo>("/api/special-notes/search-note", {
                body: { searchString: "#someLabel" }
            });
            expect(created.status).toBe(200);
            expect(created.body.noteId).toBeTruthy();
            expect(created.body.type).toBe("search");

            const saved = await api.post<CloneResponse>("/api/special-notes/save-search-note", {
                body: { searchNoteId: created.body.noteId }
            });
            expect(saved.status).toBe(200);
            expect(saved.body.success).toBe(true);
            expect(saved.body.branchId).toBeTruthy();
        });

        it("500s when saving a non-existent search note", async () => {
            const res = await api.post("/api/special-notes/save-search-note", {
                body: { searchNoteId: "missingSearchNote123" }
            });
            expect(res.status).toBe(500);
        });
    });
});
