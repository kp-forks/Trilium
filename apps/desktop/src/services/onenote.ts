import type { OneNoteLoginResult } from "@triliumnext/commons";
import { getLog, utils as coreUtils } from "@triliumnext/core";
import { setDesktopSession } from "@triliumnext/server/src/services/import/onenote/desktop_session.js";
import graph from "@triliumnext/server/src/services/import/onenote/graph.js";
import oauth from "@triliumnext/server/src/services/import/onenote/oauth.js";
import electron from "electron";
import http from "node:http";

/**
 * Main-process driver for the OneNote importer's Microsoft sign-in on the desktop build.
 *
 * The server/web flow can't be reused here: it derives the OAuth redirect URI from the incoming
 * request, which on desktop is the `trilium-app://` custom protocol (yielding an unreachable
 * `http://app/...`), and it stashes the token in the request's express-session — a session the OAuth
 * callback, arriving in a separate browser, can never reach.
 *
 * Instead we run the whole authorization-code-with-PKCE flow here: spin up a throwaway loopback HTTP
 * server, point the redirect at it, open the system browser, capture the `code`, exchange it for a
 * token, and hand the token to the process-wide desktop session store that the dispatched API
 * requests read from (see apps/server/.../onenote_import.ts). The renderer just invokes this and
 * waits for the result.
 *
 * The app registration must list `http://localhost` as a redirect URI ("Mobile and desktop
 * applications" platform); Microsoft matches loopback redirects on host only, so any port is accepted.
 */

/** How long to wait for the user to complete sign-in before giving up and tearing the server down. */
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

export function setupOneNoteHandlers() {
    electron.ipcMain.handle("onenote-login", async (): Promise<OneNoteLoginResult> => {
        try {
            return await login();
        } catch (e) {
            const message = coreUtils.safeExtractMessageAndStackFromError(e);
            getLog().error(`OneNote desktop sign-in failed: ${message}`);
            return { connected: false, error: e instanceof Error ? e.message : String(e) };
        }
    });
}

async function login(): Promise<OneNoteLoginResult> {
    const clientId = oauth.getClientId();
    const { verifier, challenge } = oauth.generatePkce();
    const state = oauth.generateState();

    const loopback = await startLoopbackServer(state);
    const redirectUri = `http://localhost:${loopback.port}/`;
    try {
        const authUrl = oauth.buildAuthorizationUrl({ clientId, redirectUri, state, challenge });
        electron.shell.openExternal(authUrl);

        const code = await loopback.waitForCode;
        const tokens = await oauth.exchangeCodeForToken({ clientId, code, verifier, redirectUri });
        const account = await graph.getAccount(tokens.access_token);

        setDesktopSession({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: Date.now() + tokens.expires_in * 1000,
            account
        });

        return { connected: true, account };
    } finally {
        loopback.close();
    }
}

interface Loopback {
    port: number;
    /** Resolves with the OAuth `code` once the browser is redirected back; rejects on error/timeout. */
    waitForCode: Promise<string>;
    close(): void;
}

function startLoopbackServer(expectedState: string): Promise<Loopback> {
    return new Promise<Loopback>((resolveServer, rejectServer) => {
        let resolveCode!: (code: string) => void;
        let rejectCode!: (err: Error) => void;
        const waitForCode = new Promise<string>((resolve, reject) => {
            resolveCode = resolve;
            rejectCode = reject;
        });

        const server = http.createServer((req, res) => {
            const url = new URL(req.url ?? "/", "http://localhost");
            const code = url.searchParams.get("code");
            const error = url.searchParams.get("error");
            const returnedState = url.searchParams.get("state");

            // Browsers fetch /favicon.ico and similar alongside the redirect; only the request that
            // actually carries the OAuth result should settle (and respond to) the flow.
            if (!code && !error) {
                res.writeHead(404).end();
                return;
            }

            if (error) {
                respond(res, `Sign-in failed: ${error}. You can close this window and try again.`);
                rejectCode(new Error(`Sign-in failed: ${error}`));
            } else if (!code || returnedState !== expectedState) {
                respond(res, "Sign-in could not be completed (invalid or expired state). Please close this window and try again.");
                rejectCode(new Error("Sign-in could not be completed (invalid or expired state)."));
            } else {
                respond(res, "Connected. You can close this window and return to Trilium.");
                resolveCode(code);
            }
        });

        const timeout = setTimeout(() => rejectCode(new Error("Timed out waiting for OneNote sign-in.")), SIGN_IN_TIMEOUT_MS);
        const guardedWaitForCode = waitForCode.finally(() => clearTimeout(timeout));

        server.on("error", rejectServer);
        // Listen on the same loopback name used in the redirect URI so the browser resolves to exactly
        // the address we bound, and let the OS pick a free port.
        server.listen(0, "localhost", () => {
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : 0;
            resolveServer({ port, waitForCode: guardedWaitForCode, close: () => server.close() });
        });
    });
}

function respond(res: http.ServerResponse, message: string) {
    res.writeHead(200, { "Content-Type": "text/html" }).end(
        `<!doctype html><html><head><meta charset="utf-8"><title>OneNote import</title></head>` +
        `<body style="font-family: sans-serif; padding: 2rem; text-align: center;">` +
        `<p>${escapeHtml(message)}</p><script>setTimeout(() => window.close(), 1500);</script></body></html>`
    );
}

function escapeHtml(text: string): string {
    return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}
