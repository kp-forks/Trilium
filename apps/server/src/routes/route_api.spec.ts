import express from "express";
import { existsSync } from "fs";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { importMiddlewareWithErrorHandling } from "./route_api.js";

/** Minimal app mounting only the import middleware + a handler that reports what it received. */
function buildApp() {
    const app = express();
    app.post("/import", importMiddlewareWithErrorHandling, (req, res) => {
        const file = req.file;
        res.json({
            hasFile: !!file,
            // Present only for the buffered (non-streamed) path; undefined when streamed from a path.
            content: file?.buffer?.toString("utf-8"),
            originalname: file?.originalname,
            hasPath: !!file?.path,
            // Whether the temp file is still on disk while the handler runs.
            tempPresent: file?.path ? existsSync(file.path) : null
        });
    });
    return app;
}

describe("importMiddlewareWithErrorHandling (disk storage)", () => {
    it("streams a generic .zip from its temp path: no buffer, temp kept for the importer", async () => {
        const res = await request(buildApp())
            .post("/import")
            .attach("upload", Buffer.from("PK-zip-bytes"), "backup.zip");

        expect(res.status).toBe(200);
        // Not buffered — the importer reads it in place via file.path.
        expect(res.body.content).toBeUndefined();
        expect(res.body.hasPath).toBe(true);
        // The temp file is still present during the import (cleaned up after the response).
        expect(res.body.tempPresent).toBe(true);
    });

    it("buffers a non-zip upload and removes the temp file before the handler", async () => {
        const res = await request(buildApp())
            .post("/import")
            .attach("upload", Buffer.from("<en-export/>"), "notes.enex");

        expect(res.status).toBe(200);
        expect(res.body.content).toBe("<en-export/>");
        expect(res.body.tempPresent).toBe(false);
    });

    it("buffers a .zip when a provider format tags it (e.g. notion), rather than streaming", async () => {
        const res = await request(buildApp())
            .post("/import")
            .field("format", "notion")
            .attach("upload", Buffer.from("notion-zip"), "export.zip");

        expect(res.status).toBe(200);
        // Tagged providers go through their buffer-based importer, so it's materialized + cleaned up.
        expect(res.body.content).toBe("notion-zip");
        expect(res.body.tempPresent).toBe(false);
    });

    it("buffers a .zip when explodeArchives is disabled (imported as a single file)", async () => {
        const res = await request(buildApp())
            .post("/import")
            .field("explodeArchives", "false")
            .attach("upload", Buffer.from("opaque-zip"), "thing.zip");

        expect(res.status).toBe(200);
        expect(res.body.content).toBe("opaque-zip");
        expect(res.body.tempPresent).toBe(false);
    });

    it("proceeds to the handler when no file is uploaded", async () => {
        const res = await request(buildApp()).post("/import");

        expect(res.status).toBe(200);
        expect(res.body.hasFile).toBe(false);
    });
});
