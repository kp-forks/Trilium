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
            content: file?.buffer?.toString("utf-8"),
            originalname: file?.originalname,
            // The unlink is awaited before the handler runs, so by now the temp file is already gone.
            tempStillExists: file?.path ? existsSync(file.path) : null
        });
    });
    return app;
}

describe("importMiddlewareWithErrorHandling (disk storage)", () => {
    it("streams the upload to disk, exposes it as file.buffer, and removes the temp file", async () => {
        const res = await request(buildApp())
            .post("/import")
            .attach("upload", Buffer.from("zip-bytes-here"), "vault.zip");

        expect(res.status).toBe(200);
        expect(res.body.content).toBe("zip-bytes-here");
        expect(res.body.originalname).toBe("vault.zip");
        expect(res.body.tempStillExists).toBe(false);
    });

    it("proceeds to the handler when no file is uploaded", async () => {
        const res = await request(buildApp()).post("/import");

        expect(res.status).toBe(200);
        expect(res.body.hasFile).toBe(false);
    });
});
