/**
 * REST endpoints for the OneNote importer. Implements the OAuth authorization-code-with-PKCE flow
 * (delegated Microsoft Graph access) and the actual import. Tokens live in the user's session only —
 * they are never written to the synced options store.
 *
 * Flow:
 *   1. GET  /api/onenote-import/auth-url  -> { authUrl }   (client opens it in a browser)
 *   2. GET  /api/onenote-import/callback  -> browser lands here after sign-in; tokens are stored
 *   3. GET  /api/onenote-import/status    -> { connected, account }   (client polls)
 *   4. GET  /api/onenote-import/notebooks -> { notebooks }
 *   5. POST /api/onenote-import/import    -> { noteId }
 */

import { becca, ValidationError } from "@triliumnext/core";
import type { Request, Response } from "express";

import graph from "../../services/import/onenote/graph.js";
import importer, { type SectionSelection } from "../../services/import/onenote/importer.js";
import oauth from "../../services/import/onenote/oauth.js";

function getAuthUrl(req: Request) {
    const clientId = oauth.getClientId();
    if (!clientId) {
        return [400, "OneNote import is not configured. Set the TRILIUM_ONENOTE_CLIENT_ID environment variable to the client id of a registered Microsoft Entra application."];
    }

    const { verifier, challenge } = oauth.generatePkce();
    const state = oauth.generateState();
    const redirectUri = getRedirectUri(req);

    req.session.oneNoteImport = { verifier, state, redirectUri };

    return { authUrl: oauth.buildAuthorizationUrl({ clientId, redirectUri, state, challenge }) };
}

async function callback(req: Request, res: Response) {
    res.triliumResponseHandled = true;

    try {
        const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
        const pending = req.session.oneNoteImport;

        if (error) {
            return sendHtml(res, `Sign-in failed: ${error}. You can close this window and try again.`);
        }
        if (!code || !pending?.verifier || !pending.state || !pending.redirectUri || pending.state !== state) {
            return sendHtml(res, "Sign-in could not be completed (invalid or expired state). Please close this window and try again.");
        }

        const clientId = oauth.getClientId();
        if (!clientId) {
            return sendHtml(res, "OneNote import is not configured on the server.");
        }

        const tokens = await oauth.exchangeCodeForToken({ clientId, code, verifier: pending.verifier, redirectUri: pending.redirectUri });
        const account = await graph.getAccount(tokens.access_token);

        req.session.oneNoteImport = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: Date.now() + tokens.expires_in * 1000,
            account
        };
        await saveSession(req);

        return sendHtml(res, `Connected as ${account.name}. You can close this window and return to Trilium.`);
    } catch (e) {
        return sendHtml(res, `Sign-in failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}

function getStatus(req: Request) {
    const session = req.session.oneNoteImport;
    return { connected: !!session?.accessToken, account: session?.account ?? null };
}

function disconnect(req: Request) {
    delete req.session.oneNoteImport;
    return {};
}

async function getNotebooks(req: Request) {
    const accessToken = await getValidAccessToken(req);
    if (!accessToken) {
        return [401, "Not connected to OneNote."];
    }
    return { notebooks: await graph.listNotebooks(accessToken) };
}

async function runImport(req: Request) {
    const accessToken = await getValidAccessToken(req);
    if (!accessToken) {
        return [401, "Not connected to OneNote."];
    }

    const { parentNoteId, sections, taskId } = req.body as { parentNoteId: string; sections: SectionSelection[]; taskId: string };
    if (!parentNoteId || !taskId) {
        throw new ValidationError("parentNoteId and taskId are required.");
    }
    if (!Array.isArray(sections) || sections.length === 0) {
        return [400, "No sections were selected."];
    }
    becca.getNoteOrThrow(parentNoteId);

    const noteId = await importer.importSelection({ accessToken, parentNoteId, sections, taskId });
    return { noteId };
}

function getRedirectUri(req: Request): string {
    return `${req.protocol}://${req.get("host")}/api/onenote-import/callback`;
}

/** Returns a usable access token, transparently refreshing it when expired, or null if disconnected. */
async function getValidAccessToken(req: Request): Promise<string | null> {
    const session = req.session.oneNoteImport;
    if (!session?.accessToken) {
        return null;
    }

    const stillValid = session.expiresAt && Date.now() < session.expiresAt - 60_000;
    if (stillValid) {
        return session.accessToken;
    }

    const clientId = oauth.getClientId();
    if (session.refreshToken && clientId) {
        const tokens = await oauth.refreshAccessToken({ clientId, refreshToken: session.refreshToken });
        session.accessToken = tokens.access_token;
        session.refreshToken = tokens.refresh_token ?? session.refreshToken;
        session.expiresAt = Date.now() + tokens.expires_in * 1000;
        await saveSession(req);
    }

    return session.accessToken;
}

function saveSession(req: Request): Promise<void> {
    return new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
}

function sendHtml(res: Response, message: string) {
    res.status(200).setHeader("Content-Type", "text/html").send(
        `<!doctype html><html><head><meta charset="utf-8"><title>OneNote import</title></head>` +
        `<body style="font-family: sans-serif; padding: 2rem; text-align: center;">` +
        `<p>${escapeHtml(message)}</p><script>setTimeout(() => window.close(), 1500);</script></body></html>`
    );
}

function escapeHtml(text: string): string {
    return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

export default {
    getAuthUrl,
    callback,
    getStatus,
    disconnect,
    getNotebooks,
    runImport
};
