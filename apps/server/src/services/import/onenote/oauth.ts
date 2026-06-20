/**
 * OAuth 2.0 authorization-code-with-PKCE flow against Microsoft Entra ID, used to obtain a
 * delegated Microsoft Graph access token for the OneNote importer.
 *
 * This is intentionally separate from the user-login OAuth in `open_id.ts`: that one authenticates
 * the Trilium user (OIDC), whereas this one authorizes the app to call the Graph API on the user's
 * behalf and therefore needs to keep (and refresh) the resulting access/refresh tokens.
 *
 * It is a PUBLIC client (no client secret), so PKCE is mandatory. The backing app registration is of
 * type "Mobile and desktop applications" in the Microsoft Entra admin center, allows personal +
 * work/school accounts, and grants delegated Graph permissions (Notes.Read, User.Read,
 * offline_access). Its client id is a public identifier (see getClientId), so it is hardcoded.
 */

import { createHash, randomBytes } from "node:crypto";

/** `/common` lets both personal Microsoft accounts and work/school accounts sign in. */
const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const AUTHORIZE_ENDPOINT = `${AUTHORITY}/authorize`;
const TOKEN_ENDPOINT = `${AUTHORITY}/token`;

/** offline_access is requested so we receive a refresh token that survives long imports. */
const SCOPES = "offline_access User.Read Notes.Read";

export interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope?: string;
}

export interface Pkce {
    verifier: string;
    challenge: string;
}

/**
 * The public client id of the registered Microsoft Entra app. A public-client (PKCE) client id is not
 * a secret — the flow is protected by PKCE, not by hiding this value — so it is hardcoded, the same
 * way other open-source apps (e.g. Obsidian's OneNote importer) ship theirs.
 */
export function getClientId(): string {
    return "47e34695-b922-4c23-8519-303fa39284c8";
}

export function generatePkce(): Pkce {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge };
}

export function generateState(): string {
    return randomBytes(16).toString("hex");
}

export function buildAuthorizationUrl({ clientId, redirectUri, state, challenge }: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
    const params = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        response_mode: "query",
        scope: SCOPES,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256"
    });
    return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

export async function exchangeCodeForToken({ clientId, code, verifier, redirectUri }: { clientId: string; code: string; verifier: string; redirectUri: string }): Promise<TokenResponse> {
    return postToken({
        client_id: clientId,
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        scope: SCOPES
    });
}

export async function refreshAccessToken({ clientId, refreshToken }: { clientId: string; refreshToken: string }): Promise<TokenResponse> {
    return postToken({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: SCOPES
    });
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
    const response = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body).toString()
    });

    const json = await response.json();
    if (!response.ok || !json.access_token) {
        const detail = json.error_description || json.error || `HTTP ${response.status}`;
        throw new Error(`OneNote token request failed: ${detail}`);
    }
    return json as TokenResponse;
}

export default {
    getClientId,
    generatePkce,
    generateState,
    buildAuthorizationUrl,
    exchangeCodeForToken,
    refreshAccessToken
};
