import type { Request } from "express";

import recoveryCodesService from "../../services/encryption/recovery_codes.js";
import totpService from "../../services/totp.js";

function generateTOTPSecret() {
    return totpService.generateSecret();
}

/**
 * Confirms a freshly generated secret by checking a code the user produced for it, and only then
 * persists it. This is the gate that prevents enabling TOTP for a secret the user can't actually
 * generate codes for (which would otherwise lock them out at the next login).
 *
 * On success we also (re)generate the recovery codes so they're issued atomically with enabling
 * TOTP and can be shown as the final enrollment step — the fallback for when the authenticator is
 * lost.
 */
function confirmTOTPSecret(req: Request) {
    const secret = req.body?.secret;
    const token = req.body?.token;

    if (typeof secret !== "string" || !secret || typeof token !== "string" || !token) {
        return { success: false };
    }

    if (!totpService.validateTOTPForSecret(secret, token)) {
        return { success: false };
    }

    totpService.setSecret(secret);
    const recoveryCodes = recoveryCodesService.generateRecoveryCodes();
    return { success: true, recoveryCodes };
}

function getTOTPStatus() {
    return {
        success: true,
        message: totpService.isTotpEnabled(),
        set: totpService.checkForTotpSecret()
    };
}

function getSecret() {
    return totpService.getTotpSecret();
}

function resetTOTP() {
    totpService.resetTotp();
    return { success: true };
}

export default {
    generateSecret: generateTOTPSecret,
    confirmSecret: confirmTOTPSecret,
    getTOTPStatus,
    getSecret,
    resetTOTP
};
