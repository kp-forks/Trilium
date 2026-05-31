import { Application } from "express";
import { beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";
import config from "../../src/services/config.js";

let app: Application;

const LOGIN_URL = "/etapi/auth/login";
const CORRECT_PASSWORD = "demo1234";

describe("etapi/auth/login", () => {
    beforeAll(async () => {
        config.General.noAuthentication = false;
        const buildApp = (await import("../../src/app.js")).default;
        app = await buildApp();
    });

    it("issues a token for the correct password", async () => {
        const response = await supertest(app)
            .post(LOGIN_URL)
            .send({ password: CORRECT_PASSWORD, tokenName: "test" })
            .expect(201);

        expect(response.body.authToken).toBeTruthy();
    });

    // Regression test for the auth-bypass where `verifyPassword` (async) was used
    // without `await`, so `!verifyPassword(...)` evaluated a truthy Promise and the
    // wrong-password branch never executed — any password yielded a full-access token.
    it("rejects a wrong password and issues no token", async () => {
        const response = await supertest(app)
            .post(LOGIN_URL)
            .send({ password: "definitely-not-the-password", tokenName: "test" })
            .expect(401);

        expect(response.body.code).toBe("WRONG_PASSWORD");
        expect(response.body.authToken).toBeUndefined();
    });

    it("rejects an empty password and issues no token", async () => {
        const response = await supertest(app)
            .post(LOGIN_URL)
            .send({ password: "", tokenName: "test" })
            .expect(401);

        expect(response.body.authToken).toBeUndefined();
    });

    // A token minted from a wrong password must not grant access to data. Before the
    // fix, the bypass returned a real, fully-privileged token here.
    it("does not grant data access from a wrong-password login attempt", async () => {
        const response = await supertest(app)
            .post(LOGIN_URL)
            .send({ password: "definitely-not-the-password", tokenName: "test" });

        const leakedToken = response.body.authToken;
        // If the bypass is present, `leakedToken` is a usable token; assert it cannot
        // be used to read the root note.
        if (leakedToken) {
            await supertest(app)
                .get("/etapi/notes/root")
                .auth("etapi", leakedToken, { type: "basic" })
                .expect(401);
        }
    });
});
