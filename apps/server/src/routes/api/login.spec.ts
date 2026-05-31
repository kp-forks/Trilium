import { app_info as appInfo, cls, date_utils as dateUtils, options, options as optionService } from "@triliumnext/core";
import type { Request } from "express";
import { describe, expect, it } from "vitest";

import totpService from "../../services/totp.js";
import utils from "../../services/utils.js";
import loginApiRoute from "./login.js";

function syncReq(body: Record<string, unknown>) {
    return { body, session: {} } as unknown as Request;
}

describe("Login (sync) API", () => {
    it("rejects a timestamp that is out of sync", () => {
        const stale = dateUtils.utcDateTimeStr(new Date(Date.now() - 10 * 60 * 1000));
        const result = loginApiRoute.loginSync(syncReq({ timestamp: stale, syncVersion: appInfo.syncVersion }));
        expect(result[0]).toBe(401);
    });

    it("rejects a non-matching sync version", () => {
        const now = dateUtils.utcNowDateTime();
        const result = loginApiRoute.loginSync(syncReq({ timestamp: now, syncVersion: appInfo.syncVersion + 1 }));
        expect(result[0]).toBe(400);
        expect((result[1] as { message: string }).message).toContain("Non-matching sync versions");
    });

    it("rejects an incorrect hash", () => {
        const now = dateUtils.utcNowDateTime();
        const result = loginApiRoute.loginSync(syncReq({ timestamp: now, syncVersion: appInfo.syncVersion, hash: "wrong" }));
        expect(result[0]).toBe(400);
        expect((result[1] as { message: string }).message).toContain("Sync login credentials are incorrect");
    });

    it("logs in with a correct HMAC of the document secret", () => {
        const now = dateUtils.utcNowDateTime();
        const documentSecret = options.getOption("documentSecret");
        const hash = utils.hmac(documentSecret, now);
        const req = syncReq({ timestamp: now, syncVersion: appInfo.syncVersion, hash });
        const result = loginApiRoute.loginSync(req) as { instanceId: string; maxEntityChangeId: number };
        expect(result.instanceId).toBeTruthy();
        expect(req.session.loggedIn).toBe(true);
    });
});

describe("Login (token) API", () => {
    it("rejects an incorrect password", async () => {
        const req = { body: { password: "wrongpassword" } } as unknown as Request;
        expect(await loginApiRoute.token(req)).toEqual([401, "Incorrect credential"]);
    });

    it("issues an ETAPI token for the correct password", async () => {
        const req = { body: { password: "demo1234", tokenName: "spec-sender" } } as unknown as Request;
        const result = await cls.init(() => loginApiRoute.token(req)) as { token: string };
        expect(result.token).toBeTruthy();
    });

    it("rejects login when TOTP is enabled and the submitted token is wrong", async () => {
        cls.init(() => {
            optionService.setOption("mfaEnabled", "true");
            totpService.createSecret(); // stores a secret so TOTP counts as enabled
        });

        const req = { body: { password: "demo1234", totpToken: "000000" } } as unknown as Request;
        expect(await cls.init(() => loginApiRoute.token(req))).toEqual([401, "Incorrect credential"]);
    });
});
