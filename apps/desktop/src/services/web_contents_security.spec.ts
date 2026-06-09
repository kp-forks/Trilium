import { beforeEach, describe, expect, it, vi } from "vitest";

// Captured app event handlers plus logged errors. `electron` is mocked because
// on CI its entry point throws ("Electron failed to install correctly") when
// the binary isn't materialized; `getLog` is stubbed because the log service
// requires `initializeCore`.
const state = vi.hoisted(() => {
    type PermissionRequestHandler = (
        webContents: unknown,
        permission: string,
        callback: (granted: boolean) => void,
        details: { requestingUrl: string }
    ) => void;
    type PermissionCheckHandler = (webContents: unknown, permission: string) => boolean;

    /** Fake Electron session capturing the permission handlers installed on it. */
    function makeFakeSession() {
        return {
            requestHandler: undefined as PermissionRequestHandler | undefined,
            checkHandler: undefined as PermissionCheckHandler | undefined,
            setPermissionRequestHandler(fn: PermissionRequestHandler) {
                this.requestHandler = fn;
            },
            setPermissionCheckHandler(fn: PermissionCheckHandler) {
                this.checkHandler = fn;
            }
        };
    }

    return {
        appHandlers: new Map<string, (...args: unknown[]) => unknown>(),
        errors: [] as string[],
        defaultSession: makeFakeSession(),
        partitionSessions: new Map<string, ReturnType<typeof makeFakeSession>>(),
        makeFakeSession
    };
});

vi.mock("@triliumnext/core", () => ({
    getLog: () => ({ error: (msg: string) => state.errors.push(msg) })
}));

vi.mock("electron", () => ({
    default: {
        app: {
            on: (event: string, fn: (...args: unknown[]) => unknown) => state.appHandlers.set(event, fn),
            whenReady: () => Promise.resolve()
        },
        session: {
            get defaultSession() {
                return state.defaultSession;
            },
            fromPartition: (partition: string) => {
                let session = state.partitionSessions.get(partition);
                if (!session) {
                    session = state.makeFakeSession();
                    state.partitionSessions.set(partition, session);
                }
                return session;
            }
        }
    }
}));

const { hardenWebviewPreferences, isPermissionAllowed, setupWebContentsSecurity } = await import("./web_contents_security.js");

describe("hardenWebviewPreferences", () => {
    it("reports no violations for a benign attach and forces isolation on", () => {
        const prefs: Electron.WebPreferences = {};

        const violations = hardenWebviewPreferences(prefs);

        expect(violations).toEqual([]);
        expect(prefs).toMatchObject({
            nodeIntegration: false,
            nodeIntegrationInSubFrames: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            contextIsolation: true,
            sandbox: true,
            partition: "persist:webview"
        });
    });

    it("accepts the dedicated guest partition and rejects any other", () => {
        const legit: Electron.WebPreferences = { partition: "persist:webview" };
        expect(hardenWebviewPreferences(legit)).toEqual([]);

        // Wrong partition in the web preferences (e.g. trying to share the
        // default session's persistent storage under another name).
        const hostile: Electron.WebPreferences = { partition: "persist:evil" };
        expect(hardenWebviewPreferences(hostile)).toEqual(["partition 'persist:evil'"]);
        expect(hostile.partition).toBe("persist:webview");

        // Wrong partition surfaced only via the attach params (attribute
        // plumbing differs between Electron versions).
        const viaParams: Electron.WebPreferences = {};
        expect(hardenWebviewPreferences(viaParams, "persist:evil")).toEqual(["partition 'persist:evil'"]);
        expect(viaParams.partition).toBe("persist:webview");
    });

    it("normalizes explicitly-disabled isolation silently (Electron default plumbing, not hostile markup)", () => {
        const prefs: Electron.WebPreferences = { contextIsolation: false, sandbox: false };

        const violations = hardenWebviewPreferences(prefs);

        expect(violations).toEqual([]);
        expect(prefs.contextIsolation).toBe(true);
        expect(prefs.sandbox).toBe(true);
    });

    it("strips preload scripts and reports them, including the legacy preloadURL alias", () => {
        const prefs = { preload: "/evil.js" } as Electron.WebPreferences;
        const legacyPrefs = { preloadURL: "file:///evil.js" } as Electron.WebPreferences & { preloadURL?: string };

        expect(hardenWebviewPreferences(prefs)).toEqual(["preload script"]);
        expect(hardenWebviewPreferences(legacyPrefs)).toEqual(["preload script"]);
        expect("preload" in prefs).toBe(false);
        expect("preloadURL" in legacyPrefs).toBe(false);
    });

    it("reports and disables every dangerous capability requested at once", () => {
        const prefs: Electron.WebPreferences = {
            nodeIntegration: true,
            nodeIntegrationInSubFrames: true,
            webSecurity: false,
            allowRunningInsecureContent: true
        };

        const violations = hardenWebviewPreferences(prefs);

        expect(violations).toEqual([
            "nodeIntegration",
            "nodeIntegrationInSubFrames",
            "webSecurity disabled",
            "allowRunningInsecureContent"
        ]);
        expect(prefs).toMatchObject({
            nodeIntegration: false,
            nodeIntegrationInSubFrames: false,
            webSecurity: true,
            allowRunningInsecureContent: false
        });
    });
});

describe("setupWebContentsSecurity", () => {
    interface MockAttach {
        preventDefault: ReturnType<typeof vi.fn>;
        prefs: Electron.WebPreferences;
    }

    beforeEach(() => {
        state.appHandlers.clear();
        state.errors.length = 0;
        setupWebContentsSecurity();
    });

    /** Simulates a window being created and then a <webview> attaching inside it. */
    function attachWebview(prefs: Electron.WebPreferences, src = "https://example.com", partition?: string): MockAttach {
        const created = state.appHandlers.get("web-contents-created");
        if (!created) throw new Error("web-contents-created not registered");

        const contentsHandlers = new Map<string, (...args: unknown[]) => unknown>();
        created({}, { on: (event: string, fn: (...args: unknown[]) => unknown) => contentsHandlers.set(event, fn) });

        const willAttach = contentsHandlers.get("will-attach-webview");
        if (!willAttach) throw new Error("will-attach-webview not registered");

        const preventDefault = vi.fn();
        willAttach({ preventDefault }, prefs, { src, partition });
        return { preventDefault, prefs };
    }

    it("lets a benign webview attach with hardened preferences", () => {
        const { preventDefault, prefs } = attachWebview({}, "https://example.com", "persist:webview");

        expect(preventDefault).not.toHaveBeenCalled();
        expect(state.errors).toEqual([]);
        expect(prefs.nodeIntegration).toBe(false);
        expect(prefs.contextIsolation).toBe(true);
        expect(prefs.partition).toBe("persist:webview");
    });

    it("denies an attach requesting a foreign partition passed via attach params", () => {
        const { preventDefault } = attachWebview({}, "https://evil.example", "persist:other");

        expect(preventDefault).toHaveBeenCalledOnce();
        expect(state.errors[0]).toContain("partition 'persist:other'");
    });

    it("denies an attach requesting nodeIntegration and logs the src", () => {
        const { preventDefault } = attachWebview({ nodeIntegration: true }, "https://evil.example");

        expect(preventDefault).toHaveBeenCalledOnce();
        expect(state.errors).toHaveLength(1);
        expect(state.errors[0]).toContain("nodeIntegration");
        expect(state.errors[0]).toContain("https://evil.example");
    });

    it("denies an attach requesting a preload script", () => {
        const { preventDefault } = attachWebview({ preload: "/evil.js" } as Electron.WebPreferences);

        expect(preventDefault).toHaveBeenCalledOnce();
        expect(state.errors[0]).toContain("preload script");
    });
});

describe("isPermissionAllowed", () => {
    it("implements the per-session allowlist matrix", () => {
        // App session: the renderer copies note content and toggles fullscreen.
        expect(isPermissionAllowed("app", "clipboard-sanitized-write")).toBe(true);
        expect(isPermissionAllowed("app", "fullscreen")).toBe(true);

        // Guest session: only fullscreen (embedded video players).
        expect(isPermissionAllowed("guest", "fullscreen")).toBe(true);
        expect(isPermissionAllowed("guest", "clipboard-sanitized-write")).toBe(false);

        // Everything else is denied everywhere.
        for (const permission of ["media", "geolocation", "notifications", "midi", "hid", "serial", "usb", "pointerLock", "clipboard-read", "openExternal"]) {
            expect(isPermissionAllowed("app", permission)).toBe(false);
            expect(isPermissionAllowed("guest", permission)).toBe(false);
        }
    });
});

describe("permission handlers", () => {
    beforeEach(async () => {
        state.appHandlers.clear();
        state.errors.length = 0;
        state.defaultSession = state.makeFakeSession();
        state.partitionSessions.clear();
        setupWebContentsSecurity();
        // Installation is gated on app.whenReady(); flush the microtask queue.
        await Promise.resolve();
    });

    it("installs request and check handlers on both the default and the webview partition session", () => {
        expect(state.defaultSession.requestHandler).toBeDefined();
        expect(state.defaultSession.checkHandler).toBeDefined();

        const guestSession = state.partitionSessions.get("persist:webview");
        expect(guestSession?.requestHandler).toBeDefined();
        expect(guestSession?.checkHandler).toBeDefined();
        expect(state.partitionSessions.size).toBe(1);
    });

    it("grants allowlisted permission requests without logging", () => {
        const handler = state.defaultSession.requestHandler;
        if (!handler) throw new Error("request handler not installed");

        const callback = vi.fn();
        handler({}, "fullscreen", callback, { requestingUrl: "trilium-app://main/" });

        expect(callback).toHaveBeenCalledWith(true);
        expect(state.errors).toEqual([]);
    });

    it("denies non-allowlisted permission requests and logs the requesting URL", () => {
        const guestSession = state.partitionSessions.get("persist:webview");
        const handler = guestSession?.requestHandler;
        if (!handler) throw new Error("request handler not installed");

        const callback = vi.fn();
        handler({}, "media", callback, { requestingUrl: "https://evil.example/" });

        expect(callback).toHaveBeenCalledWith(false);
        expect(state.errors).toHaveLength(1);
        expect(state.errors[0]).toContain("media");
        expect(state.errors[0]).toContain("https://evil.example/");
        expect(state.errors[0]).toContain("guest");
    });

    it("mirrors the policy in the synchronous check handler", () => {
        const appCheck = state.defaultSession.checkHandler;
        const guestCheck = state.partitionSessions.get("persist:webview")?.checkHandler;
        if (!appCheck || !guestCheck) throw new Error("check handlers not installed");

        expect(appCheck({}, "clipboard-sanitized-write")).toBe(true);
        expect(appCheck({}, "geolocation")).toBe(false);
        expect(guestCheck({}, "fullscreen")).toBe(true);
        expect(guestCheck({}, "clipboard-sanitized-write")).toBe(false);
    });
});
