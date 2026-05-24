import { doubleCsrf } from "csrf-csrf";
import type { NextFunction, Request, Response } from "express";

import sessionSecret from "../services/session_secret.js";
import { isElectron } from "../services/utils.js";

export const CSRF_COOKIE_NAME = "trilium-csrf";

const doubleCsrfUtilities = doubleCsrf({
    getSecret: () => sessionSecret,
    cookieOptions: {
        path: "/",
        secure: false,
        sameSite: "strict",
        httpOnly: true
    },
    cookieName: CSRF_COOKIE_NAME,
    getSessionIdentifier: (req) => req.session.id
});

export const { generateCsrfToken } = doubleCsrfUtilities;

// Skip CSRF validation under Electron. The desktop renderer is our own UI,
// requests arrive through the `trilium-app://` custom protocol, and Express
// sessions don't round-trip through that path — so the HMAC double-submit
// check has nothing meaningful to validate against. Auth is similarly
// bypassed for Electron in `services/auth.ts`.
export function doubleCsrfProtection(req: Request, res: Response, next: NextFunction) {
    if (isElectron) {
        return next();
    }
    return doubleCsrfUtilities.doubleCsrfProtection(req, res, next);
}
