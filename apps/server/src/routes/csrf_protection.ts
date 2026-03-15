import { doubleCsrf } from "csrf-csrf";

import sessionSecret from "../services/session_secret.js";
import { isElectron } from "../services/utils.js";

export const CSRF_COOKIE_NAME = "trilium-csrf";

const doubleCsrfUtilities = doubleCsrf({
    getSecret: () => sessionSecret,
    cookieOptions: {
        path: "/",
        secure: false,
        sameSite: "strict",
        httpOnly: !isElectron // set to false for Electron, see https://github.com/TriliumNext/Trilium/pull/966
    },
    cookieName: CSRF_COOKIE_NAME,
    // In Electron, API calls go through an IPC bypass (routes/electron.ts) that uses a
    // FakeRequest with a static session ID, while the bootstrap request goes through real
    // Express with a real session. This mismatch causes CSRF validation to always fail.
    // Since Electron is a local single-user app, a constant identifier is acceptable here.
    getSessionIdentifier: (req) => isElectron ? "electron" : req.session.id
});

export const { generateCsrfToken, doubleCsrfProtection } = doubleCsrfUtilities;
