import { afterEach, describe, expect, it, vi } from "vitest";

import { capacitorHttpHandler, resetNativeProxyProbeForTests } from "./capacitor_http_handler.js";

interface CapacitorWindow {
    Capacitor?: unknown;
}

type RequestMock = ReturnType<typeof vi.fn>;

/**
 * Models the real bridge: `Plugins` only contains JS-registered plugins (CapacitorHttp is
 * registered by @capacitor/core itself), while native-only plugins are announced via
 * `PluginHeaders` and must be materialized through `registerPlugin()`, which also stores
 * the proxy in `Plugins`.
 */
function installCapacitor({ triliumHttp, capacitorHttp, platform }: { triliumHttp?: RequestMock; capacitorHttp?: RequestMock; platform?: string }) {
    const plugins: Record<string, { request: RequestMock }> = {};
    if (capacitorHttp) {
        plugins.CapacitorHttp = { request: capacitorHttp };
    }

    const registerPlugin = vi.fn((name: string) => {
        if (name === "TriliumHttp" && triliumHttp) {
            plugins.TriliumHttp = { request: triliumHttp };
            return plugins.TriliumHttp;
        }
        return undefined;
    });

    (window as unknown as CapacitorWindow).Capacitor = {
        Plugins: plugins,
        PluginHeaders: triliumHttp ? [{ name: "TriliumHttp", methods: [{ name: "request" }] }] : [],
        registerPlugin,
        ...(platform ? { getPlatform: () => platform } : {})
    };

    return { registerPlugin };
}

/** The minimal Response surface the handler touches, with fetch()'s lowercase header keys. */
function fakeResponse({ status = 200, headers = {}, body = "" }: { status?: number; headers?: Record<string, string>; body?: string }): Response {
    const map = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: {
            get: (key: string) => map.get(key.toLowerCase()) ?? null,
            forEach: (callback: (value: string, key: string) => void) => map.forEach(callback)
        },
        text: () => Promise.resolve(body)
    } as unknown as Response;
}

describe("capacitorHttpHandler", () => {
    afterEach(() => {
        delete (window as unknown as CapacitorWindow).Capacitor;
        resetNativeProxyProbeForTests();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("throws when no native HTTP plugin is available", async () => {
        await expect(
            capacitorHttpHandler({ method: "GET", url: "https://x", headers: {} })
        ).rejects.toThrow("No native HTTP plugin is available");
    });

    it("materializes TriliumHttp via registerPlugin when the native bridge announces it", async () => {
        const triliumHttp = vi.fn().mockResolvedValue({ status: 200, headers: {}, data: "via trilium" });
        const capacitorHttp = vi.fn().mockResolvedValue({ status: 200, headers: {}, data: "via capacitor" });
        const { registerPlugin } = installCapacitor({ triliumHttp, capacitorHttp });

        const result = await capacitorHttpHandler({ method: "GET", url: "https://x", headers: {} });

        expect(result.body).toBe("via trilium");
        expect(registerPlugin).toHaveBeenCalledWith("TriliumHttp");
        expect(capacitorHttp).not.toHaveBeenCalled();

        // Second call reuses the proxy stored in Plugins instead of re-registering
        await capacitorHttpHandler({ method: "GET", url: "https://x", headers: {} });
        expect(registerPlugin).toHaveBeenCalledOnce();
        expect(triliumHttp).toHaveBeenCalledTimes(2);
    });

    it("falls back to CapacitorHttp when the native binary lacks TriliumHttp", async () => {
        const capacitorHttp = vi.fn().mockResolvedValue({ status: 200, headers: {}, data: "via capacitor" });
        const { registerPlugin } = installCapacitor({ capacitorHttp });

        const result = await capacitorHttpHandler({ method: "GET", url: "https://x", headers: {} });

        expect(result.body).toBe("via capacitor");
        // Never registers a plugin the native side did not announce — the proxy would throw.
        expect(registerPlugin).not.toHaveBeenCalled();
    });

    it("requests the raw text response and passes a JSON string through unchanged (no re-parse/re-stringify)", async () => {
        const rawJson = '{"ok":true}';
        const triliumHttp = vi.fn().mockResolvedValue({
            status: 200,
            headers: { "Content-Type": "application/json", "X-Custom": "v" },
            data: rawJson
        });
        installCapacitor({ triliumHttp });

        const result = await capacitorHttpHandler({
            method: "POST",
            url: "https://api/test",
            headers: { Authorization: "token" },
            body: "{}"
        });

        expect(triliumHttp).toHaveBeenCalledWith({
            method: "POST",
            url: "https://api/test",
            headers: { Authorization: "token" },
            data: "{}",
            responseType: "text"
        });
        expect(result.status).toBe(200);
        expect(result.headers).toEqual({ "content-type": "application/json", "x-custom": "v" });
        // Passed straight through — not JSON.stringify'd back.
        expect(result.body).toBe(rawJson);
    });

    it("still serializes object response data (CapacitorHttp fallback pre-parses JSON)", async () => {
        const capacitorHttp = vi.fn().mockResolvedValue({ status: 200, headers: {}, data: { ok: true } });
        installCapacitor({ capacitorHttp });

        const result = await capacitorHttpHandler({ method: "GET", url: "https://x", headers: {} });
        expect(result.body).toBe(JSON.stringify({ ok: true }));
    });

    it("passes string response data through unchanged", async () => {
        const triliumHttp = vi.fn().mockResolvedValue({ status: 201, headers: {}, data: "plain text" });
        installCapacitor({ triliumHttp });

        const result = await capacitorHttpHandler({ method: "GET", url: "https://x", headers: {} });
        expect(result.body).toBe("plain text");
    });

    it("passes arraybuffer responses through as the raw base64 string", async () => {
        const triliumHttp = vi.fn().mockResolvedValue({ status: 200, headers: {}, data: "QUJD" });
        installCapacitor({ triliumHttp });

        const result = await capacitorHttpHandler({
            method: "GET",
            url: "https://x/image",
            headers: {},
            responseType: "arraybuffer"
        });
        expect(result.body).toBe("QUJD");
    });

    describe("native streaming proxy", () => {
        it("streams GET text requests through the proxy with tunneled headers, probing only once", async () => {
            const triliumHttp = vi.fn();
            installCapacitor({ triliumHttp, platform: "android" });
            const fetchMock = vi.fn()
                .mockResolvedValueOnce(fakeResponse({ headers: { "x-trilium-native-http": "1" }, body: "pong" }))
                .mockResolvedValueOnce(fakeResponse({
                    headers: { "Content-Type": "application/json", "x-trilium-set-cookie": "sid=next" },
                    body: '{"ok":true}'
                }))
                .mockResolvedValueOnce(fakeResponse({ body: "second" }));
            vi.stubGlobal("fetch", fetchMock);

            const url = "https://sync.example.com/api/sync/changed?lastEntityChangeId=5";
            const result = await capacitorHttpHandler({
                method: "GET",
                url,
                headers: { Cookie: "sid=current", pageCount: "1" }
            });

            expect(fetchMock).toHaveBeenNthCalledWith(1, "/_trilium_native_http/ping", { cache: "no-store" });
            expect(fetchMock).toHaveBeenNthCalledWith(2,
                `/_trilium_native_http/fetch?url=${encodeURIComponent(url)}`,
                {
                    method: "GET",
                    headers: { "x-trilium-h-Cookie": "sid=current", "x-trilium-h-pageCount": "1" },
                    cache: "no-store"
                });
            expect(result.status).toBe(200);
            expect(result.body).toBe('{"ok":true}');
            // Set-Cookie is unreadable through fetch(), so it arrives renamed and is mapped back.
            expect(result.headers["set-cookie"]).toBe("sid=next");
            expect(result.headers["x-trilium-set-cookie"]).toBeUndefined();
            expect(triliumHttp).not.toHaveBeenCalled();

            // The availability probe is cached — a second request goes straight to /fetch.
            await capacitorHttpHandler({ method: "GET", url, headers: {} });
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });

        it("keeps POSTs and binary requests on the plugin transport", async () => {
            const triliumHttp = vi.fn().mockResolvedValue({ status: 200, headers: {}, data: "ok" });
            installCapacitor({ triliumHttp, platform: "android" });
            const fetchMock = vi.fn();
            vi.stubGlobal("fetch", fetchMock);

            await capacitorHttpHandler({ method: "POST", url: "https://x", headers: {}, body: "{}" });
            await capacitorHttpHandler({ method: "GET", url: "https://x/image", headers: {}, responseType: "arraybuffer" });

            expect(fetchMock).not.toHaveBeenCalled();
            expect(triliumHttp).toHaveBeenCalledTimes(2);
        });

        it("does not probe the proxy off Android", async () => {
            const triliumHttp = vi.fn().mockResolvedValue({ status: 200, headers: {}, data: "ok" });
            installCapacitor({ triliumHttp, platform: "ios" });
            const fetchMock = vi.fn();
            vi.stubGlobal("fetch", fetchMock);

            await capacitorHttpHandler({ method: "GET", url: "https://x", headers: {} });

            expect(fetchMock).not.toHaveBeenCalled();
            expect(triliumHttp).toHaveBeenCalledOnce();
        });

        it("uses the plugin transport when the ping is not answered by the interceptor (stale APK)", async () => {
            const triliumHttp = vi.fn().mockResolvedValue({ status: 200, headers: {}, data: "ok" });
            installCapacitor({ triliumHttp, platform: "android" });
            // An older APK serves the path from the asset server — no marker header.
            const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ status: 404, body: "not found" }));
            vi.stubGlobal("fetch", fetchMock);

            await capacitorHttpHandler({ method: "GET", url: "https://x", headers: {} });
            await capacitorHttpHandler({ method: "GET", url: "https://x", headers: {} });

            // The failed probe is cached too — pinged once, never fetched through the proxy.
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(triliumHttp).toHaveBeenCalledTimes(2);
        });

        it("falls back to the plugin transport when the proxy reports an internal error", async () => {
            const triliumHttp = vi.fn().mockResolvedValue({ status: 200, headers: {}, data: "via plugin" });
            installCapacitor({ triliumHttp, platform: "android" });
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
            const fetchMock = vi.fn()
                .mockResolvedValueOnce(fakeResponse({ headers: { "x-trilium-native-http": "1" }, body: "pong" }))
                .mockResolvedValueOnce(fakeResponse({
                    status: 502,
                    headers: { "x-trilium-native-http": "1", "x-trilium-proxy-error": "SocketTimeoutException: timed out" }
                }));
            vi.stubGlobal("fetch", fetchMock);

            const result = await capacitorHttpHandler({ method: "GET", url: "https://x", headers: {} });

            expect(result.body).toBe("via plugin");
            expect(warnSpy).toHaveBeenCalledOnce();
        });
    });
});
