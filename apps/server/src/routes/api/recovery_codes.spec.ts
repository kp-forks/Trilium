import { cls } from "@triliumnext/core";
import type { Request } from "express";
import { describe, expect, it } from "vitest";

import recoveryCodesService from "../../services/encryption/recovery_codes.js";
import recoveryCodesRoute from "./recovery_codes.js";

describe("Recovery codes API", () => {
    it("reports no keys before any are set", () => {
        // Runs first within this fork's fresh DB copy.
        const result = recoveryCodesRoute.checkForRecoveryKeys();
        expect(result).toEqual({ success: true, keysExist: false });
        expect(recoveryCodesRoute.getUsedRecoveryCodes()).toEqual([]);
    });

    it("verifies a code and marks it as used", () => {
        // Recovery codes are issued during TOTP enrollment, not by this route, so seed them via the
        // service to exercise the read/verify endpoints.
        const codes = cls.init(() => {
            const generated = recoveryCodesService.createRecoveryCodes();
            recoveryCodesService.setRecoveryCodes(generated.join(","));
            return generated;
        });
        expect(codes).toHaveLength(8);

        expect(recoveryCodesRoute.checkForRecoveryKeys()).toEqual({ success: true, keysExist: true });

        const verifyReq = { body: { recovery_code_guess: codes[0] } } as unknown as Request;
        expect(cls.init(() => recoveryCodesRoute.verifyRecoveryCode(verifyReq))).toEqual({ success: true });

        // A wrong guess fails.
        const wrongReq = { body: { recovery_code_guess: "not-a-valid-code" } } as unknown as Request;
        expect(cls.init(() => recoveryCodesRoute.verifyRecoveryCode(wrongReq))).toEqual({ success: false });

        const used = recoveryCodesRoute.getUsedRecoveryCodes() as { success: boolean; usedRecoveryCodes: string[] };
        expect(used.success).toBe(true);
        // The used code is replaced by an ISO-ish timestamp; the rest stay as indices.
        expect(used.usedRecoveryCodes.some(c => /T/.test(c))).toBe(true);
    });
});
