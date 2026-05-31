import { cls, note_service as noteService } from "@triliumnext/core";
import type { Application } from "express";
import supertest from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

let app: Application;

describe("Custom request/resource handlers", () => {
    beforeAll(async () => {
        app = await (await import("../app.js")).default();

        cls.init(() => {
            // A backend script note that handles a custom request.
            const handler = noteService.createNewNote({
                parentNoteId: "root",
                title: "Custom handler",
                type: "code",
                mime: "application/javascript;env=backend",
                content: `api.res.status(200).send("handled:" + api.pathParams[0]);`
            }).note;
            handler.setLabel("customRequestHandler", "greet/([a-z]+)");

            // A script note that throws, to exercise the error branch.
            const thrower = noteService.createNewNote({
                parentNoteId: "root",
                title: "Throwing handler",
                type: "code",
                mime: "application/javascript;env=backend",
                content: `throw new Error("boom in handler");`
            }).note;
            thrower.setLabel("customRequestHandler", "explode");

            // A resource note served directly.
            const resource = noteService.createNewNote({
                parentNoteId: "root",
                title: "Custom resource",
                type: "text",
                content: "<p>resource body</p>"
            }).note;
            resource.setLabel("customResourceProvider", "resource");

            // Empty value → skipped; invalid regex → caught and skipped. Both are
            // exercised by the "no handler matches" request below.
            noteService.createNewNote({ parentNoteId: "root", title: "Empty handler", type: "text", content: "x" })
                .note.setLabel("customRequestHandler", "   ");
            noteService.createNewNote({ parentNoteId: "root", title: "Bad regex handler", type: "text", content: "x" })
                .note.setLabel("customRequestHandler", "([unclosed");
        });
    });

    it("runs a custom request handler with captured path params", async () => {
        const res = await supertest(app).get("/custom/greet/world").expect(200);
        expect(res.text).toBe("handled:world");
    });

    it("returns 500 when the custom handler throws", async () => {
        const res = await supertest(app).get("/custom/explode").expect(500);
        expect(res.text).toContain("boom in handler");
    });

    it("serves a custom resource provider note", async () => {
        const res = await supertest(app).get("/custom/resource").expect(200);
        expect(res.text).toContain("resource body");
    });

    it("returns 404 when no handler matches", async () => {
        const res = await supertest(app).get("/custom/no-such-path").expect(404);
        expect(res.text).toContain("No handler matched");
    });
});
