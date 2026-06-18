import { cls, options } from "@triliumnext/core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import config from "./config.js";
import openIDEncryption from "./encryption/open_id_encryption.js";
import openID, { resolveOAuthIdentity } from "./open_id.js";
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

        it("auto-selects the token-endpoint auth method by issuer", () => {
            setOauthConfig(true);

            // Non-Google issuer (the setOauthConfig default) → spec-default client_secret_basic.
            expect(openID.generateOAuthConfig().clientAuthMethod).toBe("client_secret_basic");

            // Google issuer (trailing slash tolerated) → client_secret_post, since Google rejects the
            // RFC-encoded Basic credentials (client_ids contain "-"/"." which become %2D/%2E).
            mfa.oauthIssuerBaseUrl = "https://accounts.google.com/";
            expect(openID.generateOAuthConfig().clientAuthMethod).toBe("client_secret_post");
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
});
