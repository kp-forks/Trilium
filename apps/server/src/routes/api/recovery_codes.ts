import recovery_codes from '../../services/encryption/recovery_codes.js';
import totp from '../../services/totp.js';
import type { Request } from 'express';

function verifyRecoveryCode(req: Request) {
    const success = recovery_codes.verifyRecoveryCode(req.body.recovery_code_guess);

    return { success: success };
}

/**
 * Issues a fresh batch of recovery codes for the already-enrolled TOTP secret, replacing any existing
 * ones, and returns them for one-time display. Refuses when no TOTP secret is set, so recovery codes
 * can never be minted for an inactive second factor — the only other way to get codes is enrollment.
 */
function regenerateRecoveryCodes() {
    if (!totp.checkForTotpSecret()) {
        return { success: false };
    }

    const recoveryCodes = recovery_codes.createRecoveryCodes();
    recovery_codes.setRecoveryCodes(recoveryCodes.join(','));
    return { success: true, recoveryCodes };
}

function checkForRecoveryKeys() {
    return {
        success: true, keysExist: recovery_codes.isRecoveryCodeSet()
    };
}

function getUsedRecoveryCodes() {
    if (!recovery_codes.isRecoveryCodeSet()) {
        return []
    }

    const dateRegex = RegExp(/^\d{4}\/\d{2}\/\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/gm);
    const recoveryCodes = recovery_codes.getRecoveryCodes();

    const usedStatus = recoveryCodes.map(recoveryKey => {
        return (dateRegex.test(recoveryKey)) ? recoveryKey : String(recoveryCodes.indexOf(recoveryKey))
    })

    return {
        success: true,
        usedRecoveryCodes: usedStatus
    };
}

export default {
    verifyRecoveryCode,
    regenerateRecoveryCodes,
    checkForRecoveryKeys,
    getUsedRecoveryCodes
};