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
        // Reset to no persisted secret each test, so persist assertions below are meaningful.
        cls.init(() => totpEncryption.resetTotpSecret());
    });

    it("generates a base32 secret without persisting it", () => {
        const result = cls.init(() => totpRoute.generateSecret());
        expect(result.success).toBe(true);
        expect(result.message).toMatch(/^[A-Z2-7]+$/);
        // Generation must not store the secret — that only happens after the user confirms a code.
        expect(totpRoute.getTOTPStatus().set).toBe(false);
    });

    it("confirmSecret persists the secret and issues recovery codes when the code is valid", () => {
        mockValidate.mockReturnValue(true);
        const result = runConfirm({ secret: SECRET, token: "000000" }) as
            { success: boolean; recoveryCodes?: string[] };
        expect(result.success).toBe(true);
        // Recovery codes are issued atomically with enabling TOTP, to be shown as the final step.
        expect(result.recoveryCodes).toHaveLength(8);
        expect(mockValidate).toHaveBeenCalledWith({ passcode: "000000", secret: SECRET });
        expect(totpRoute.getTOTPStatus().set).toBe(true);
    });

    it("confirmSecret rejects an invalid code and leaves nothing persisted", () => {
        mockValidate.mockReturnValue(false);
        expect(runConfirm({ secret: SECRET, token: "999999" })).toEqual({ success: false });
        expect(totpRoute.getTOTPStatus().set).toBe(false);
    });

    it("confirmSecret rejects missing secret or token without validating", () => {
        expect(runConfirm({ token: "000000" })).toEqual({ success: false });
        expect(runConfirm({ secret: SECRET })).toEqual({ success: false });
        expect(runConfirm({})).toEqual({ success: false });
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

function runConfirm(body: unknown) {
    return cls.init(() => totpRoute.confirmSecret({ body } as unknown as Request));
}
