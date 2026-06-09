import { beforeEach, describe, expect, it, vi } from "vitest";

// Captured app event handlers plus logged errors. `electron` is mocked because
// on CI its entry point throws ("Electron failed to install correctly") when
// the binary isn't materialized; `getLog` is stubbed because the log service
// requires `initializeCore`.
const state = vi.hoisted(() => ({
    appHandlers: new Map<string, (...args: unknown[]) => unknown>(),
    errors: [] as string[]
}));

vi.mock("@triliumnext/core", () => ({
    getLog: () => ({ error: (msg: string) => state.errors.push(msg) })
}));

vi.mock("electron", () => ({
    default: {
        app: { on: (event: string, fn: (...args: unknown[]) => unknown) => state.appHandlers.set(event, fn) }
    }
}));

const { hardenWebviewPreferences, setupWebContentsSecurity } = await import("./web_contents_security.js");

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
            sandbox: true
        });
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
    function attachWebview(prefs: Electron.WebPreferences, src = "https://example.com"): MockAttach {
        const created = state.appHandlers.get("web-contents-created");
        if (!created) throw new Error("web-contents-created not registered");

        const contentsHandlers = new Map<string, (...args: unknown[]) => unknown>();
        created({}, { on: (event: string, fn: (...args: unknown[]) => unknown) => contentsHandlers.set(event, fn) });

        const willAttach = contentsHandlers.get("will-attach-webview");
        if (!willAttach) throw new Error("will-attach-webview not registered");

        const preventDefault = vi.fn();
        willAttach({ preventDefault }, prefs, { src });
        return { preventDefault, prefs };
    }

    it("lets a benign webview attach with hardened preferences", () => {
        const { preventDefault, prefs } = attachWebview({});

        expect(preventDefault).not.toHaveBeenCalled();
        expect(state.errors).toEqual([]);
        expect(prefs.nodeIntegration).toBe(false);
        expect(prefs.contextIsolation).toBe(true);
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
