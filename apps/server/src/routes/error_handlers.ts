import { ForbiddenError, HttpError, NotFoundError } from "@triliumnext/core";
import type { Application, NextFunction, Request, Response } from "express";

import { getLog } from "@triliumnext/core";

function register(app: Application) {

    app.use((err: unknown | Error, req: Request, res: Response, next: NextFunction) => {

        const isCsrfTokenError = typeof err === "object"
            && err
            && "code" in err
            && err.code === "EBADCSRFTOKEN";

        if (isCsrfTokenError) {
            const csrfHeader = req.headers["x-csrf-token"];
            const csrfHeaderPrefix = typeof csrfHeader === "string" ? csrfHeader.slice(0, 8) : undefined;
            const tokenInfo = csrfHeaderPrefix ? ` (token prefix: ${csrfHeaderPrefix})` : "";
            getLog().error(`Invalid CSRF token on ${req.method} ${req.url}${tokenInfo}`);
            return next(new ForbiddenError("Invalid CSRF token"));
        }

        return next(err);
    });

    // catch 404 and forward to error handler
    app.use((req, res, next) => {
        const err = new NotFoundError(`Router not found for request ${req.method} ${req.url}`);
        next(err);
    });

    // error handler
    app.use((err: unknown | Error, req: Request, res: Response, _next: NextFunction) => {

        const statusCode = (err instanceof HttpError) ? err.statusCode : 500;
        const errMessage = (err instanceof Error && statusCode !== 404)
            ? err
            : `${statusCode} ${req.method} ${req.url}`;

        getLog().info(errMessage);

        // Some upstream errors carry their real cause in OAuth/OIDC-style `error` /
        // `error_description` properties rather than the generic `.message`. The express-openid-connect
        // callback is the prime example: a failed token exchange surfaces only "server responded with an
        // error in the response body" as the message, while the actual reason (e.g. redirect_uri_mismatch,
        // invalid_client) lives in these fields. Log them so such failures are diagnosable.
        const oauthDetail = extractOAuthErrorDetail(err);
        if (oauthDetail) {
            getLog().error(`OAuth/OpenID error on ${req.method} ${req.url}: ${oauthDetail}`);
        }

        res.status(statusCode).send({
            message: err instanceof Error ? err.message : "Unknown Error"
        });

    });
}

/**
 * Pulls the OAuth/OIDC error code and description off an error, if present. Returns `null` when the
 * error carries neither, so callers can skip logging for ordinary errors.
 */
export function extractOAuthErrorDetail(err: unknown) {
    if (typeof err !== "object" || err === null) {
        return null;
    }

    const candidate = err as { error?: unknown; error_description?: unknown };
    const code = typeof candidate.error === "string" ? candidate.error : undefined;
    const description = typeof candidate.error_description === "string" ? candidate.error_description : undefined;

    if (!code && !description) {
        return null;
    }

    return [ code, description ].filter(Boolean).join(": ");
}

export default {
    register
};
