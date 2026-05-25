import express from "express";
import multer from "multer";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
    default: {
        app: { whenReady: () => Promise.resolve() },
        protocol: { handle: () => {} }
    }
}));

const { dispatch } = await import("./electron.js");

function buildTestApp() {
    const app = express();
    app.use(express.json());

    const upload = multer().single("upload");
    app.post("/upload", upload, (req, res) => {
        res.json({
            field: (req.body as Record<string, unknown>)?.note,
            filename: req.file?.originalname,
            size: req.file?.size,
            content: req.file?.buffer?.toString("utf-8")
        });
    });

    app.post("/echo-json", (req, res) => {
        res.json({ echo: req.body });
    });

    return app;
}

describe("electron protocol dispatcher", () => {
    it("forwards multipart/form-data through multer so handlers see req.file", async () => {
        const app = buildTestApp();
        const formData = new FormData();
        formData.append("upload", new Blob(["hello world"], { type: "text/plain" }), "hello.txt");
        formData.append("note", "abc123");

        const request = new Request("trilium-app://app/upload", { method: "POST", body: formData });
        const response = await dispatch(app, request);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            field: "abc123",
            filename: "hello.txt",
            size: 11,
            content: "hello world"
        });
    });

    it("forwards application/json bodies as parsed objects", async () => {
        const app = buildTestApp();
        const request = new Request("trilium-app://app/echo-json", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ hello: "world" })
        });
        const response = await dispatch(app, request);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ echo: { hello: "world" } });
    });
});
