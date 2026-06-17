import { cls } from "@triliumnext/core";
import type { Request } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGenerateSecret, mockValidate } = vi.hoisted(() => ({
    mockGenerateSecret: vi.fn<() => string>(),
    mockValidate: vi.fn<(args: { passcode: string; secret: string }) => boolean>()
}));

vi.mock("time2fa", () => ({
    generateSecret: mockGenerateSecret,
    Totp: { validate: mockValidate }
}));

import totpEncryption from "../../services/encryption/totp_encryption.js";
import totpRoute from "./totp.js";

const SECRET = "JBSWY3DPEHPK3PXP";

describe("TOTP API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGenerateSecret.mockReturnValue(SECRET);
        mockValidate.mockReturnValue(true);
        // Start each test with no persisted secret so the persist/not-persist assertions are meaningful.
        cls.init(() => totpEncryption.resetTotpSecret());
    });

    it("generates a base32 secret without persisting it", () => {
        const result = cls.init(() => totpRoute.generateSecret());
        expect(result.success).toBe(true);
        expect(result.message).toMatch(/^[A-Z2-7]+$/);
        // The secret must not be stored until the user confirms a code for it — otherwise generating
        // (then walking away) could enable TOTP for a secret they never set up, locking them out.
        expect(totpRoute.getTOTPStatus().set).toBe(false);
    });

    it("confirmSecret persists the secret when the code is valid", () => {
        mockValidate.mockReturnValue(true);
        const result = cls.init(() => totpRoute.confirmSecret(confirmReq({ secret: SECRET, token: "000000" })));
        expect(result).toEqual({ success: true });
        expect(mockValidate).toHaveBeenCalledWith({ passcode: "000000", secret: SECRET });
        expect(totpRoute.getTOTPStatus().set).toBe(true);
    });

    it("confirmSecret rejects an invalid code and leaves nothing persisted", () => {
        mockValidate.mockReturnValue(false);
        const result = cls.init(() => totpRoute.confirmSecret(confirmReq({ secret: SECRET, token: "999999" })));
        expect(result).toEqual({ success: false });
        expect(totpRoute.getTOTPStatus().set).toBe(false);
    });

    it("confirmSecret rejects missing secret or token without validating", () => {
        expect(cls.init(() => totpRoute.confirmSecret(confirmReq({ token: "000000" })))).toEqual({ success: false });
        expect(cls.init(() => totpRoute.confirmSecret(confirmReq({ secret: SECRET })))).toEqual({ success: false });
        expect(cls.init(() => totpRoute.confirmSecret(confirmReq({})))).toEqual({ success: false });
        expect(mockValidate).not.toHaveBeenCalled();
        expect(totpRoute.getTOTPStatus().set).toBe(false);
    });

    it("reports the TOTP status", () => {
        const status = totpRoute.getTOTPStatus();
        expect(status.success).toBe(true);
        expect(typeof status.message).toBe("boolean");
        expect(typeof status.set).toBe("boolean");
    });

    it("exposes the configured secret (empty when none is set)", () => {
        const result = totpRoute.getSecret();
        expect(result).toBeDefined();
    });
});

function confirmReq(body: unknown) {
    return { body } as unknown as Request;
}
