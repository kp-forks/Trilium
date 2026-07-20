import { cls, options } from "@triliumnext/core";
import type { NextFunction, Request as ExpressRequest, RequestHandler, Response as ExpressResponse } from "express";
import { ClientSecretBasic, ClientSecretPost } from "openid-client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import config from "./config.js";
import openIDEncryption from "./encryption/open_id_encryption.js";
import openID, { createReactiveOidcMiddleware, type ProviderCapabilities, resolveClientAuthMethod, resolveOAuthIdentity, supportsRpInitiatedLogout } from "./open_id.js";
import sql from "./sql.js";
import sqlInit from "./sql_init.js";

const mfa = config.MultiFactorAuthentication;
const originalMfa = { ...mfa };

function setOauthConfig(complete: boolean) {
    mfa.oauthBaseUrl = complete ? "https://app.example.com" : "";
    mfa.oauthClientId = complete ? "client-id" : "";
    mfa.oauthClientSecret = complete ? "client-secret" : "";
    mfa.oauthIssuerBaseUrl = "https://issuer.example.com";
    mfa.oauthIssuerName = "Acme";
    mfa.oauthIssuerIcon = "icon.png";
}

describe("open_id", () => {
    beforeAll(async () => {
        sqlInit.initializeDb();
        await sqlInit.dbReady;
    });

    afterEach(() => {
        Object.assign(mfa, originalMfa);
        vi.restoreAllMocks();
    });

    it("checkOpenIDConfig reports each missing oauth variable", () => {
        setOauthConfig(false);
        expect(openID.isOpenIDEnabled()).toBe(false);
        // with all three blank, getOAuthStatus surfaces them
        const status = openID.getOAuthStatus();
        expect(status.success).toBe(true);
        expect(status.missingVars).toEqual(
            expect.arrayContaining(["oauthBaseUrl", "oauthClientId", "oauthClientSecret"])
        );
        expect(status.enabled).toBe(false);
    });

    it("isOpenIDConfigured requires full config and mfaMethod=oauth", () => {
        setOauthConfig(true);
        cls.init(() => options.setOption("mfaMethod", "totp"));
        expect(openID.isOpenIDConfigured()).toBe(false); // method not oauth

        cls.init(() => options.setOption("mfaMethod", "oauth"));
        expect(openID.isOpenIDConfigured()).toBe(true);
        expect(openID.getOAuthStatus().missingVars).toEqual([]);
    });

    it("isOpenIDEnabled additionally requires an enrolled account", () => {
        setOauthConfig(true);
        cls.init(() => options.setOption("mfaMethod", "oauth"));

        // Configured but not enrolled → SSO is not yet the active login method.
        vi.spyOn(openIDEncryption, "isSubjectIdentifierSaved").mockReturnValue(false);
        expect(openID.isOpenIDEnabled()).toBe(false);
        expect(openID.getOAuthStatus().enrolled).toBe(false);

        // Once an identity is bound, OAuth becomes active.
        vi.spyOn(openIDEncryption, "isSubjectIdentifierSaved").mockReturnValue(true);
        expect(openID.isOpenIDEnabled()).toBe(true);
        expect(openID.getOAuthStatus().enrolled).toBe(true);
    });

    it("exposes issuer name/icon from config", () => {
        setOauthConfig(true);
        expect(openID.getSSOIssuerName()).toBe("Acme");
        expect(openID.getSSOIssuerIcon()).toBe("icon.png");
    });

    it("derives the issuer icon from the base URL favicon when none is configured", () => {
        setOauthConfig(true);
        mfa.oauthIssuerIcon = "";

        // Falls back to the issuer's favicon.
        mfa.oauthIssuerBaseUrl = "https://issuer.example.com";
        expect(openID.getSSOIssuerIcon()).toBe("https://issuer.example.com/favicon.ico");

        // Trailing slashes / extra path segments resolve against the origin root.
        mfa.oauthIssuerBaseUrl = "https://accounts.google.com/";
        expect(openID.getSSOIssuerIcon()).toBe("https://accounts.google.com/favicon.ico");

        // No (or invalid) base URL → no icon, leaving the UI to use its glyph fallback.
        mfa.oauthIssuerBaseUrl = "";
        expect(openID.getSSOIssuerIcon()).toBe("");
    });

    it("isUserSaved and getOAuthStatus read user_data", () => {
        cls.init(() => {
            sql.transactional(() => {
                sql.execute("DELETE FROM user_data");
                sql.upsert("user_data", "tmpID", {
                    tmpID: 0,
                    isSetup: "true",
                    username: "Alice",
                    email: "alice@example.com"
                });
            });
        });
        expect(openID.isUserSaved()).toBe(true);
        const status = openID.getOAuthStatus();
        expect(status.name).toBe("Alice");
        expect(status.email).toBe("alice@example.com");
    });

    it("getOAuthStatus surfaces the configured issuer details", () => {
        setOauthConfig(true);
        const status = openID.getOAuthStatus();
        expect(status.issuerName).toBe("Acme");
        expect(status.issuerUrl).toBe("https://issuer.example.com");
        expect(status.issuerIcon).toBe("icon.png");
    });

    it("clearSavedUser empties user_data", () => {
        const result = cls.init(() => openID.clearSavedUser());
        expect(result.success).toBe(true);
        expect(openID.isUserSaved()).toBe(false);
    });

    describe("isTokenValid", () => {
        const fakeRes = {} as never;
        const next = (() => {}) as never;

        it("reports 'not set up' when oidc is undefined", async () => {
            const req = { oidc: undefined } as never;
            const res = await openID.isTokenValid(req, fakeRes, next);
            expect(res.success).toBe(false);
            expect(typeof res.user).toBe("boolean");
        });

        it("reports valid when fetchUserInfo succeeds", async () => {
            const req = { oidc: { fetchUserInfo: vi.fn().mockResolvedValue({}) } } as never;
            const res = await openID.isTokenValid(req, fakeRes, next);
            expect(res.success).toBe(true);
        });

        it("reports invalid when fetchUserInfo throws", async () => {
            const req = {
                oidc: { fetchUserInfo: vi.fn().mockRejectedValue(new Error("nope")) }
            } as never;
            const res = await openID.isTokenValid(req, fakeRes, next);
            expect(res.success).toBe(false);
        });
    });

    describe("generateOAuthConfig.afterCallback", () => {
        function buildConfig() {
            setOauthConfig(true);
            return openID.generateOAuthConfig();
        }

        // express-session exposes a callback-style regenerate(); the success paths call it to defeat
        // session fixation, so the mock session must provide a working one (invoked synchronously here).
        function sessionWith(initial: Record<string, unknown> = {}) {
            return {
                ...initial,
                regenerate(cb: (err?: unknown) => void) {
                    cb();
                }
            } as Record<string, unknown>;
        }

        it("wires routes and credentials from config", () => {
            const cfg = buildConfig();
            expect(cfg.baseURL).toBe("https://app.example.com");
            expect(cfg.clientID).toBe("client-id");
            expect(cfg.routes.callback).toBe("/callback");
            expect(typeof cfg.afterCallback).toBe("function");
        });

        it("passes the probed provider capabilities through to express-openid-connect", () => {
            setOauthConfig(true);

            // Without a probe result, both settings fall back to the conservative spec defaults.
            expect(openID.generateOAuthConfig()).toMatchObject({
                clientAuthMethod: "client_secret_basic",
                idpLogout: false
            });

            expect(openID.generateOAuthConfig({
                endSessionSupported: true,
                clientAuthMethod: "client_secret_post"
            })).toMatchObject({
                clientAuthMethod: "client_secret_post",
                idpLogout: true
            });
        });

        it("returns the session unchanged when the DB is not initialized", async () => {
            const cfg = buildConfig();
            const spy = vi.spyOn(sqlInit, "isDbInitialized").mockReturnValue(false);
            const session = { marker: 1 } as never;
            const result = await cfg.afterCallback({ oidc: { user: {} } } as never, {} as never, session);
            expect(result).toBe(session);
            spy.mockRestore();
        });

        it("returns the session unchanged when there is no user", async () => {
            const cfg = buildConfig();
            const session = { marker: 2 } as never;
            const result = await cfg.afterCallback({ oidc: { user: undefined } } as never, {} as never, session);
            expect(result).toBe(session);
        });

        it("enrolls the user when an authenticated owner signs in and none is enrolled yet", async () => {
            const cfg = buildConfig();
            // No account enrolled yet, and the request comes from an already-logged-in session (the owner
            // enrolling from Settings) → bind the identity and keep them logged in.
            vi.spyOn(openIDEncryption, "isSubjectIdentifierSaved").mockReturnValue(false);
            const saveSpy = vi.spyOn(openIDEncryption, "saveUser").mockReturnValue(true);
            const req = {
                oidc: {
                    user: { sub: "sub-1", name: "Alice", email: "alice@example.com" },
                    fetchUserInfo: vi.fn().mockResolvedValue({})
                },
                session: sessionWith({ loggedIn: true })
            } as never;
            const session = { marker: 3 } as never;

            const result = await cfg.afterCallback(req, {} as never, session);

            expect(saveSpy).toHaveBeenCalledWith("sub-1", "Alice", "alice@example.com");
            expect((req as { session: { loggedIn: boolean } }).session.loggedIn).toBe(true);
            expect(result).toBe(session);
        });

        it("enrolls with name/email from UserInfo when the ID token omits them (Authelia case)", async () => {
            const cfg = buildConfig();
            vi.spyOn(openIDEncryption, "isSubjectIdentifierSaved").mockReturnValue(false);
            const saveSpy = vi.spyOn(openIDEncryption, "saveUser").mockReturnValue(true);
            // ID token carries only `sub`; the profile claims arrive from the UserInfo endpoint.
            const fetchUserInfo = vi.fn().mockResolvedValue({ name: "Alice", email: "alice@example.com" });
            const req = {
                oidc: { user: { sub: "sub-1" }, fetchUserInfo },
                session: sessionWith({ loggedIn: true })
            } as never;

            await cfg.afterCallback(req, {} as never, { marker: 7 } as never);

            expect(fetchUserInfo).toHaveBeenCalled();
            expect(saveSpy).toHaveBeenCalledWith("sub-1", "Alice", "alice@example.com");
        });

        it("falls back to ID token claims when the UserInfo fetch fails", async () => {
            const cfg = buildConfig();
            vi.spyOn(openIDEncryption, "isSubjectIdentifierSaved").mockReturnValue(false);
            const saveSpy = vi.spyOn(openIDEncryption, "saveUser").mockReturnValue(true);
            const req = {
                oidc: {
                    user: { sub: "sub-1", name: "Alice", email: "alice@example.com" },
                    fetchUserInfo: vi.fn().mockRejectedValue(new Error("network down"))
                },
                session: sessionWith({ loggedIn: true })
            } as never;

            await cfg.afterCallback(req, {} as never, { marker: 8 } as never);

            expect(saveSpy).toHaveBeenCalledWith("sub-1", "Alice", "alice@example.com");
        });

        it("refuses enrollment from an unauthenticated session (no first-login claim)", async () => {
            const cfg = buildConfig();
            vi.spyOn(openIDEncryption, "isSubjectIdentifierSaved").mockReturnValue(false);
            const saveSpy = vi.spyOn(openIDEncryption, "saveUser").mockReturnValue(true);
            const req = {
                oidc: { user: { sub: "stranger", name: "Mallory", email: "mallory@evil.example" } },
                session: {} as Record<string, unknown>
            } as never;
            const session = { marker: 4 } as never;

            const result = await cfg.afterCallback(req, {} as never, session);

            expect(saveSpy).not.toHaveBeenCalled();
            expect((req as { session: { loggedIn?: boolean } }).session.loggedIn).toBeFalsy();
            expect((req as { session: { ssoError?: string } }).session.ssoError).toBe("not_enrolled");
            expect(result).toBe(session);
        });

        it("logs in an enrolled user only when the subject identifier matches", async () => {
            const cfg = buildConfig();
            vi.spyOn(openIDEncryption, "isSubjectIdentifierSaved").mockReturnValue(true);
            const verifySpy = vi.spyOn(openIDEncryption, "verifySubjectIdentifier").mockReturnValue(true);
            const req = {
                oidc: { user: { sub: "enrolled-sub", name: "Alice", email: "alice@example.com" } },
                session: sessionWith()
            } as never;
            const session = { marker: 5 } as never;

            const result = await cfg.afterCallback(req, {} as never, session);

            expect(verifySpy).toHaveBeenCalledWith("enrolled-sub");
            expect((req as { session: { loggedIn: boolean } }).session.loggedIn).toBe(true);
            expect((req as { session: { lastAuthState: { ssoEnabled: boolean } } }).session.lastAuthState.ssoEnabled).toBe(true);
            expect(result).toBe(session);
        });

        it("rejects login when the authenticated account is not the enrolled one", async () => {
            const cfg = buildConfig();
            vi.spyOn(openIDEncryption, "isSubjectIdentifierSaved").mockReturnValue(true);
            vi.spyOn(openIDEncryption, "verifySubjectIdentifier").mockReturnValue(false);
            const req = {
                oidc: { user: { sub: "other-sub", name: "Mallory", email: "mallory@evil.example" } },
                session: {} as Record<string, unknown>
            } as never;
            const session = { marker: 6 } as never;

            const result = await cfg.afterCallback(req, {} as never, session);

            expect((req as { session: { loggedIn: boolean } }).session.loggedIn).toBe(false);
            expect((req as { session: { ssoError?: string } }).session.ssoError).toBe("wrong_account");
            expect(result).toBe(session);
        });

        it("fails closed when session regeneration errors", async () => {
            const cfg = buildConfig();
            vi.spyOn(openIDEncryption, "isSubjectIdentifierSaved").mockReturnValue(true);
            vi.spyOn(openIDEncryption, "verifySubjectIdentifier").mockReturnValue(true);
            const req = {
                oidc: { user: { sub: "enrolled-sub", name: "Alice", email: "alice@example.com" } },
                session: {
                    regenerate(cb: (err?: unknown) => void) {
                        cb(new Error("store unavailable"));
                    }
                } as Record<string, unknown>
            } as never;
            const session = { marker: 9 } as never;

            const result = await cfg.afterCallback(req, {} as never, session);

            // Regeneration failed → the session must not be elevated.
            expect((req as { session: { loggedIn: boolean } }).session.loggedIn).toBe(false);
            expect((req as { session: { lastAuthState?: unknown } }).session.lastAuthState).toBeUndefined();
            expect(result).toBe(session);
        });
    });

    describe("resolveOAuthIdentity", () => {
        it("prefers the ID token claims when present", () => {
            const identity = resolveOAuthIdentity(
                { name: "Alice", email: "alice@id.example" },
                { name: "Other", email: "other@userinfo.example" }
            );
            expect(identity).toEqual({ name: "Alice", email: "alice@id.example" });
        });

        it("falls back to UserInfo per-field when the ID token omits or blanks a claim", () => {
            expect(resolveOAuthIdentity({ sub: "x" }, { name: "Alice", email: "alice@example.com" }))
                .toEqual({ name: "Alice", email: "alice@example.com" });
            // Empty strings in the ID token are treated as missing.
            expect(resolveOAuthIdentity({ name: "", email: "alice@id.example" }, { name: "Alice" }))
                .toEqual({ name: "Alice", email: "alice@id.example" });
        });

        it("yields empty strings when a claim is on neither source", () => {
            expect(resolveOAuthIdentity({ sub: "x" }, undefined)).toEqual({ name: "", email: "" });
            expect(resolveOAuthIdentity(undefined, undefined)).toEqual({ name: "", email: "" });
            // Non-string claim values are ignored rather than coerced.
            expect(resolveOAuthIdentity({ name: 42, email: null }, undefined)).toEqual({ name: "", email: "" });
        });
    });

    describe("supportsRpInitiatedLogout", () => {
        it("is true only for a non-empty string end_session_endpoint", () => {
            expect(supportsRpInitiatedLogout({ end_session_endpoint: "https://idp.example/logout" })).toBe(true);
            expect(supportsRpInitiatedLogout({ end_session_endpoint: "" })).toBe(false);
            // Provider without the endpoint (Google, Authelia) — the case that crashes idpLogout.
            expect(supportsRpInitiatedLogout({ authorization_endpoint: "https://idp.example/auth" })).toBe(false);
            // Non-string / non-object inputs are rejected rather than coerced.
            expect(supportsRpInitiatedLogout({ end_session_endpoint: 42 })).toBe(false);
            expect(supportsRpInitiatedLogout(null)).toBe(false);
            expect(supportsRpInitiatedLogout(undefined)).toBe(false);
            expect(supportsRpInitiatedLogout("not an object")).toBe(false);
        });
    });

    /**
     * Regression cover for #10585: OIDC login against GitLab broke in v0.104.0 with
     * `OAUTH_WWW_AUTHENTICATE_CHALLENGE`.
     *
     * The cause is the express-openid-connect 2.20.2 → 3.2.0 bump (openid-client v5 → v6/oauth4webapi).
     * v6's `ClientSecretBasic` applies strict RFC 6749 §2.3.1 form-encoding *inside* the HTTP Basic
     * header, escaping `- _ . ! ~ * ' ( )`; v5 used plain `encodeURIComponent`, which leaves them alone.
     * GitLab's client secrets are prefixed `gloas-`, so the hyphen becomes `%2D` and GitLab's Doorkeeper
     * token endpoint — which base64-decodes the header but does not percent-decode it — sees a wrong
     * secret and answers 401 + `WWW-Authenticate`.
     *
     * The method must therefore be picked from the provider's own discovery document rather than
     * hardcoded per issuer (the previous Google-only special case had the identical root cause).
     */
    describe("resolveClientAuthMethod", () => {
        // Verbatim from https://gitlab.com/.well-known/openid-configuration.
        const GITLAB = { token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"] };
        const GOOGLE = { token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"] };
        const BASIC_ONLY = { token_endpoint_auth_methods_supported: ["client_secret_basic"] };

        it("prefers client_secret_post whenever the provider advertises it", () => {
            // Body-posted credentials are form-encoded by the transport and arrive intact, so post is
            // the safe choice for any provider that accepts it — regardless of issuer.
            expect(resolveClientAuthMethod(GITLAB)).toBe("client_secret_post");
            expect(resolveClientAuthMethod(GOOGLE)).toBe("client_secret_post");
        });

        it("falls back to client_secret_basic when post is unavailable or discovery is unusable", () => {
            // A provider that registers confidential clients as basic-only must still get basic.
            expect(resolveClientAuthMethod(BASIC_ONLY)).toBe("client_secret_basic");
            // Field absent → the OIDC Core default for the token endpoint is client_secret_basic.
            expect(resolveClientAuthMethod({ issuer: "https://idp.example" })).toBe("client_secret_basic");
            // Malformed / missing metadata (a failed discovery probe) fails safe to the spec default
            // rather than silently switching every provider's authentication method.
            expect(resolveClientAuthMethod({ token_endpoint_auth_methods_supported: "client_secret_post" })).toBe("client_secret_basic");
            expect(resolveClientAuthMethod(null)).toBe("client_secret_basic");
            expect(resolveClientAuthMethod(undefined)).toBe("client_secret_basic");
        });

        /**
         * The end-to-end property the fix actually has to hold: whatever method we select, the
         * credentials must reach the token endpoint byte-identical to what the user configured. This
         * drives the real openid-client encoders, so a future dependency bump that reintroduces the
         * mangling fails here rather than in production.
         */
        it("delivers a GitLab-style secret to the token endpoint intact", () => {
            // GitLab: 64-hex Application ID, `gloas-` prefixed secret (the hyphen is what breaks Basic).
            const clientId = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
            const clientSecret = "gloas-4f3a2b1c-9d8e-7f6a-5b4c-3d2e1f0a9b8c";

            const received = credentialsAtTokenEndpoint(resolveClientAuthMethod(GITLAB), clientId, clientSecret);

            expect(received).toEqual({ clientId, clientSecret });
        });

        /**
         * The basic-only fallback has no safer method to fall back *to*, so it stays correct only for a
         * provider that percent-decodes per spec. Both halves are pinned here so the tradeoff is explicit:
         * choosing basic is safe for a compliant provider and lossy for a non-compliant one — which is
         * precisely why post is preferred wherever it's on offer.
         */
        it("relies on the provider decoding per spec when it only offers basic", () => {
            // The credentials from Trilium's own Authelia dev harness; the "_" is what Basic escapes.
            const clientId = "trilium";
            const clientSecret = "insecure_secret";
            const method = resolveClientAuthMethod(BASIC_ONLY);

            expect(credentialsAtTokenEndpoint(method, clientId, clientSecret, { percentDecodes: true }))
                .toEqual({ clientId, clientSecret });

            // A provider that skips the percent-decoding step sees a corrupted secret instead.
            expect(credentialsAtTokenEndpoint(method, clientId, clientSecret))
                .toEqual({ clientId, clientSecret: "insecure%5Fsecret" });
        });
    });

    describe("probeProviderCapabilities", () => {
        const wellKnownUrl = "https://issuer.example.com/.well-known/openid-configuration";
        const DEFAULTS = { endSessionSupported: false, clientAuthMethod: "client_secret_basic" };

        function mockFetch(impl: (url: string) => Partial<Response> | Promise<Partial<Response>>) {
            return vi.spyOn(globalThis, "fetch").mockImplementation(
                ((url: string) => Promise.resolve(impl(url))) as typeof fetch
            );
        }

        // One fetch has to serve both settings — probing the same document twice would double the
        // startup cost and could observe an inconsistent provider between the two reads.
        it("derives every capability from a single discovery fetch", async () => {
            setOauthConfig(true);
            const fetchSpy = mockFetch(() => ({
                ok: true,
                json: () => Promise.resolve({
                    end_session_endpoint: "https://issuer.example.com/logout",
                    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"]
                })
            }));

            expect(await openID.probeProviderCapabilities()).toEqual({
                endSessionSupported: true,
                clientAuthMethod: "client_secret_post"
            });
            expect(fetchSpy).toHaveBeenCalledOnce();
            expect(fetchSpy).toHaveBeenCalledWith(wellKnownUrl, expect.anything());
        });

        it("falls back to the spec defaults when discovery advertises neither capability", async () => {
            setOauthConfig(true);
            mockFetch(() => ({ ok: true, json: () => Promise.resolve({}) }));
            expect(await openID.probeProviderCapabilities()).toEqual(DEFAULTS);
        });

        it("fails safe on a non-OK response or a thrown fetch", async () => {
            setOauthConfig(true);

            mockFetch(() => ({ ok: false, status: 404, json: () => Promise.resolve({}) }));
            expect(await openID.probeProviderCapabilities()).toEqual(DEFAULTS);

            vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
            expect(await openID.probeProviderCapabilities()).toEqual(DEFAULTS);
        });

        it("does not attempt discovery when no issuer is configured", async () => {
            setOauthConfig(true);
            mfa.oauthIssuerBaseUrl = "";
            const fetchSpy = mockFetch(() => ({ ok: true, json: () => Promise.resolve({}) }));

            expect(await openID.probeProviderCapabilities()).toEqual(DEFAULTS);
            expect(fetchSpy).not.toHaveBeenCalled();
        });
    });
});

/**
 * The reactive OIDC middleware is the fix for "switching the MFA method to OpenID requires a server
 * restart". The old code decided *once at startup* whether to mount express-openid-connect; these tests
 * pin down the new contract: the middleware is always mounted, re-evaluates `isOpenIDConfigured()` on
 * every request, and lazily builds (and caches) the underlying handler the first time OAuth is used.
 */
describe("createReactiveOidcMiddleware", () => {
    const BASIC_CAPABILITIES: ProviderCapabilities = {
        endSessionSupported: false,
        clientAuthMethod: "client_secret_basic"
    };
    const POST_CAPABILITIES: ProviderCapabilities = {
        endSessionSupported: true,
        clientAuthMethod: "client_secret_post"
    };

    function setup() {
        let configured = false;

        const oidcHandler = vi.fn(((_req, _res, next) => next()) as RequestHandler);
        const buildAuth = vi.fn(() => oidcHandler);
        const probeProviderCapabilities = vi.fn().mockResolvedValue(BASIC_CAPABILITIES);
        const generateOAuthConfig = vi.fn((capabilities: ProviderCapabilities) => ({ capabilities }) as never);
        const isConfigured = vi.fn(() => configured);

        const middleware = createReactiveOidcMiddleware({
            isConfigured,
            probeProviderCapabilities,
            generateOAuthConfig,
            buildAuth
        });

        return {
            middleware,
            oidcHandler,
            buildAuth,
            probeProviderCapabilities,
            generateOAuthConfig,
            isConfigured,
            setConfigured: (value: boolean) => { configured = value; }
        };
    }

    async function run(middleware: RequestHandler) {
        const next = vi.fn() as unknown as NextFunction;
        const req = {} as ExpressRequest;
        const res = {} as ExpressResponse;
        await middleware(req, res, next);
        return { next, req, res };
    }

    it("passes through without building the OIDC handler when OAuth is not selected", async () => {
        const t = setup(); // starts unconfigured

        const { next } = await run(t.middleware);

        expect(next).toHaveBeenCalledOnce();
        expect(t.buildAuth).not.toHaveBeenCalled();
        expect(t.oidcHandler).not.toHaveBeenCalled();
        // No work is done while OAuth is unselected — not even the discovery probe.
        expect(t.probeProviderCapabilities).not.toHaveBeenCalled();
    });

    it("builds and delegates to the OIDC handler when OAuth is selected", async () => {
        const t = setup();
        t.setConfigured(true);

        const { req, res, next } = await run(t.middleware);

        expect(t.probeProviderCapabilities).toHaveBeenCalledOnce();
        expect(t.generateOAuthConfig).toHaveBeenCalledWith(BASIC_CAPABILITIES);
        expect(t.buildAuth).toHaveBeenCalledOnce();
        expect(t.oidcHandler).toHaveBeenCalledWith(req, res, expect.any(Function));
        // The wrapper must hand off to the OIDC handler and NOT call next() itself — calling it again
        // after the handler already drove the request double-invokes the pipeline ("Cannot set headers
        // after they are sent"). Exactly one next() (the one the handler makes) must reach the chain.
        expect(next).toHaveBeenCalledOnce();
    });

    it("builds the underlying handler only once across requests (cached)", async () => {
        const t = setup();
        t.setConfigured(true);

        await run(t.middleware);
        await run(t.middleware);

        expect(t.buildAuth).toHaveBeenCalledOnce();
        expect(t.probeProviderCapabilities).toHaveBeenCalledOnce();
        expect(t.oidcHandler).toHaveBeenCalledTimes(2);
    });

    it("passes the discovery-probe result into the OAuth config", async () => {
        const t = setup();
        t.probeProviderCapabilities.mockResolvedValue(POST_CAPABILITIES);
        t.setConfigured(true);

        await run(t.middleware);

        expect(t.generateOAuthConfig).toHaveBeenCalledWith(POST_CAPABILITIES);
    });

    // This is the regression the whole change exists to fix: with the old startup-only mount, flipping
    // mfaMethod to "oauth" at runtime did nothing until a restart. Here the same instance starts
    // unselected (passes through) and then activates on the next request after the option flips.
    it("activates without a restart when the sign-in method switches to OAuth at runtime", async () => {
        const t = setup(); // unconfigured at "boot"

        await run(t.middleware);
        expect(t.buildAuth).not.toHaveBeenCalled();
        expect(t.oidcHandler).not.toHaveBeenCalled();

        // User switches the MFA method to OpenID in Settings — no restart.
        t.setConfigured(true);

        const { req, res } = await run(t.middleware);
        expect(t.buildAuth).toHaveBeenCalledOnce();
        expect(t.oidcHandler).toHaveBeenCalledWith(req, res, expect.any(Function));
    });

    it("stops delegating when OAuth is deselected at runtime", async () => {
        const t = setup();
        t.setConfigured(true);
        await run(t.middleware); // builds + delegates
        expect(t.oidcHandler).toHaveBeenCalledOnce();

        // Switch back to local/TOTP — the request should pass straight through again.
        t.setConfigured(false);
        const { next } = await run(t.middleware);

        expect(next).toHaveBeenCalledOnce();
        expect(t.oidcHandler).toHaveBeenCalledOnce(); // not invoked a second time
    });

    it("builds the handler only once even under concurrent first requests", async () => {
        const t = setup();
        t.setConfigured(true);

        // A deferred discovery probe keeps the first build in flight while a second request arrives,
        // exercising the in-flight-init guard (otherwise both requests would each build a handler).
        let resolveProbe: (value: ProviderCapabilities) => void = () => {};
        t.probeProviderCapabilities.mockReturnValue(new Promise<ProviderCapabilities>((resolve) => { resolveProbe = resolve; }));

        const first = run(t.middleware);
        const second = run(t.middleware);
        resolveProbe(BASIC_CAPABILITIES);
        await Promise.all([first, second]);

        expect(t.buildAuth).toHaveBeenCalledOnce();
        expect(t.oidcHandler).toHaveBeenCalledTimes(2);
    });

    // A failed first init must not be cached as a permanently-rejected promise: a transient failure
    // (discovery probe error, malformed config) would otherwise break every subsequent OAuth request
    // until a server restart. The next request must be allowed to retry and recover.
    it("retries the build on a subsequent request after a failed init", async () => {
        const t = setup();
        t.setConfigured(true);
        t.probeProviderCapabilities.mockRejectedValueOnce(new Error("transient discovery failure"));

        await expect(run(t.middleware)).rejects.toThrow("transient discovery failure");
        expect(t.oidcHandler).not.toHaveBeenCalled();

        // Second request: the probe succeeds and the handler is finally built and delegated to.
        const { req, res } = await run(t.middleware);
        expect(t.buildAuth).toHaveBeenCalledOnce();
        expect(t.oidcHandler).toHaveBeenCalledWith(req, res, expect.any(Function));
    });
});

/**
 * Replays what a provider's token endpoint actually receives for a given client authentication method,
 * driving the real openid-client encoders rather than re-implementing them.
 *
 * `percentDecodes` models the one behavioural split that matters. oauth4webapi always percent-encodes
 * the Basic credentials per RFC 6749 §2.3.1, so what the provider ends up with depends entirely on
 * whether it decodes them again:
 *
 * - `true` — a spec-compliant provider (Authelia/fosite, Keycloak). Basic round-trips correctly.
 * - `false` — Rack/Doorkeeper, i.e. GitLab: it base64-decodes the header and splits on ":" but never
 *   percent-decodes, so it compares against a corrupted secret. That asymmetry is the bug behind #10585.
 *
 * `client_secret_post` is unaffected either way: the credentials ride in the form body, which every
 * provider form-decodes as a matter of course.
 */
function credentialsAtTokenEndpoint(
    method: "client_secret_basic" | "client_secret_post",
    clientId: string,
    clientSecret: string,
    { percentDecodes = false } = {}
) {
    const headers = new Headers();
    const body = new URLSearchParams();
    const applyAuth = method === "client_secret_post"
        ? ClientSecretPost(clientSecret)
        : ClientSecretBasic(clientSecret);
    applyAuth({} as never, { client_id: clientId } as never, body, headers);

    const authorization = headers.get("authorization");
    if (authorization) {
        const decoded = Buffer.from(authorization.replace(/^Basic /, ""), "base64").toString();
        const separator = decoded.indexOf(":");
        const asReceived = (value: string) => (percentDecodes ? decodeURIComponent(value) : value);
        return {
            clientId: asReceived(decoded.slice(0, separator)),
            clientSecret: asReceived(decoded.slice(separator + 1))
        };
    }

    return { clientId: body.get("client_id"), clientSecret: body.get("client_secret") };
}
