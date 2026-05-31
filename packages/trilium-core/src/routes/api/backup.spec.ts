import { beforeAll, describe, expect, it } from "vitest";

import { CoreApiTester } from "../../test/api_tester";

/**
 * Drives the shared core backup routes through {@link CoreApiTester} (no
 * Express) against the REAL backup service — fs-backed on node, OPFS-backed on
 * standalone. No service mocks. Runs under both suites.
 *
 * The download *success* path is node-only: the standalone test runtime
 * (happy-dom) has no OPFS, so `StandaloneBackupService` gracefully no-ops and
 * `getBackupContent` always returns `null` there. That single path is covered
 * by the node suite; everything else is asserted cross-runtime.
 */
const isBrowserRuntime = typeof window !== "undefined";
let api: CoreApiTester;

describe("Backup API (core)", () => {
    beforeAll(() => {
        api = CoreApiTester.build();
    });

    it("lists existing backups as an array", async () => {
        const res = await api.get(`/api/database/backups`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it("creates a backup and returns the resulting file path", async () => {
        const res = await api.post<{ backupFile: string }>(`/api/database/backup-database`);
        expect(res.status).toBe(200);
        expect(typeof res.body.backupFile).toBe("string");
        expect(res.body.backupFile).toBeTruthy();
    });

    describe("downloadBackup", () => {
        it("returns 400 when the filePath query is missing", async () => {
            const res = await api.get<string>(`/api/database/backup/download`);
            expect(res.status).toBe(400);
        });

        it("returns 404 when the backup does not exist", async () => {
            const res = await api.get<string>(`/api/database/backup/download`, {
                query: { filePath: "/backups/does-not-exist.db" }
            });
            expect(res.status).toBe(404);
        });

        it.skipIf(isBrowserRuntime)("streams a real backup with download headers (node)", async () => {
            // Create a real backup, then download it by its actual path.
            const created = await api.post<{ backupFile: string }>(`/api/database/backup-database`);
            const filePath = created.body.backupFile;

            const res = await api.get(`/api/database/backup/download`, { query: { filePath } });
            expect(res.status).toBe(200);
            expect(res.headers["Content-Type"]).toBe("application/x-sqlite3");
            expect(res.headers["Content-Disposition"]).toContain("attachment; filename=");
            expect(Buffer.isBuffer(res.body) || typeof res.body === "string").toBe(true);
        });
    });
});
