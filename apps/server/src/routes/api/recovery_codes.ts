import recovery_codes from '../../services/encryption/recovery_codes.js';
import type { Request } from 'express';

function setRecoveryCodes(req: Request) {
    const success = recovery_codes.setRecoveryCodes(req.body.recoveryCodes.join(','));
    return { success: success, message: 'Recovery codes set!' };
}

function verifyRecoveryCode(req: Request) {
    const success = recovery_codes.verifyRecoveryCode(req.body.recovery_code_guess);

    return { success: success };
}

function checkForRecoveryKeys() {
    return {
        success: true, keysExist: recovery_codes.isRecoveryCodeSet()
    };
}

function generateRecoveryCodes() {
    return { success: true, recoveryCodes: recovery_codes.generateRecoveryCodes() };
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
    setRecoveryCodes,
    generateRecoveryCodes,
    verifyRecoveryCode,
    checkForRecoveryKeys,
    getUsedRecoveryCodes
};