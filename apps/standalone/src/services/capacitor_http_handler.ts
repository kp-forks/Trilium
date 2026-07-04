import type { NativeHttpHandler } from "../local-bridge.js";

// Access plugins via the global Capacitor bridge rather than importing
// from "@capacitor/core" — bare module specifiers don't resolve in the
// browser's native ES module loader.
interface CapacitorHttpResponse {
    status: number;
    headers: Record<string, string>;
    data: unknown;
}

interface HttpPlugin {
    request(opts: {
        method: string;
        url: string;
        headers: Record<string, string>;
        data?: string;
        responseType?: string;
    }): Promise<CapacitorHttpResponse>;
}

function getHttpPlugin(): HttpPlugin {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor;

    // Prefer the app's own TriliumHttp plugin: it always returns the body as a plain string.
    // CapacitorHttp force-parses application/json responses into a Java object tree and
    // re-serializes them into the bridge message regardless of the requested responseType
    // (the "backward compatibility" branch in HttpRequestHandler.readData), which costs two
    // full JSON passes per multi-megabyte sync response.
    //
    // Capacitor.Plugins only contains plugins that were registered from the JS side, so a
    // native-only plugin like TriliumHttp does not appear there on its own — it has to be
    // looked up via registerPlugin(), and only when the native bridge actually announced it
    // in PluginHeaders (otherwise proxy method calls would throw "not implemented").
    // registerPlugin() also stores the proxy in Capacitor.Plugins, so the first branch acts
    // as the cache on subsequent calls. The CapacitorHttp fallback keeps things working if
    // the JS bundle is ever newer than the installed native binary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasTriliumHttp = cap?.PluginHeaders?.some((header: any) => header?.name === "TriliumHttp");
    const plugin = cap?.Plugins?.TriliumHttp
        ?? (hasTriliumHttp ? cap.registerPlugin("TriliumHttp") : null)
        ?? cap?.Plugins?.CapacitorHttp;

    if (!plugin) {
        throw new Error("No native HTTP plugin is available");
    }

    return plugin as HttpPlugin;
}

// Streaming same-origin proxy (Android only): the native side answers fetch()es under
// this path prefix from WebViewClient.shouldInterceptRequest and streams the upstream
// body straight into the WebView — no plugin-bridge envelope, no full-body Java string,
// no base64 (see TriliumWebViewClient.java). Because the page-visible request is
// same-origin, no CORS check applies; the cross-origin hop happens natively, exactly as
// it does on the plugin transports.
const NATIVE_PROXY_PREFIX = "/_trilium_native_http/";
const HEADER_TUNNEL_PREFIX = "x-trilium-h-";

let nativeProxyProbe: Promise<boolean> | null = null;

// A failed probe is retried after a while: right after an app update the previous
// service worker can still own the page's fetches (and swallow the probe) until the
// updated one calls clients.claim(), so "unavailable" may be a temporary condition.
const PROBE_RETRY_MS = 15_000;

function isNativeProxyAvailable(): Promise<boolean> {
    nativeProxyProbe ??= probeNativeProxy().then((available) => {
        if (!available) {
            setTimeout(() => {
                nativeProxyProbe = null;
            }, PROBE_RETRY_MS);
        }
        return available;
    });
    return nativeProxyProbe;
}

function probeNativeProxy(): Promise<boolean> {
    return (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cap = (window as any).Capacitor;
        if (cap?.getPlatform?.() !== "android") {
            // iOS has no equivalent hook for https URLs — it stays on the plugin transport.
            return false;
        }
        try {
            const response = await fetch(`${NATIVE_PROXY_PREFIX}ping`, { cache: "no-store" });
            // The marker header proves the interceptor answered — on an APK older than this
            // bundle the request falls through to the asset server instead.
            return response.ok && response.headers.get("x-trilium-native-http") === "1";
        } catch {
            return false;
        }
    })();
}

/** Test-only: clears the cached availability probe. */
export function resetNativeProxyProbeForTests() {
    nativeProxyProbe = null;
}

type NativeHttpRequest = Parameters<NativeHttpHandler>[0];

function canUseNativeProxy(request: NativeHttpRequest): boolean {
    const method = request.method.toUpperCase();
    // shouldInterceptRequest cannot read request bodies, and binary responses would have
    // to be re-encoded as base64 for the bridge protocol — those stay on the plugin path.
    return (method === "GET" || method === "HEAD")
        && !request.body
        && (request.responseType ?? "text") === "text";
}

async function nativeProxyFetch(request: NativeHttpRequest): ReturnType<NativeHttpHandler> {
    // fetch() refuses forbidden header names such as Cookie, so every header rides under
    // a tunnel prefix that the interceptor strips before forwarding upstream. This also
    // means WebView-generated headers are never forwarded — only what the worker asked for.
    const tunneledHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
        tunneledHeaders[HEADER_TUNNEL_PREFIX + key] = value;
    }

    const response = await fetch(`${NATIVE_PROXY_PREFIX}fetch?url=${encodeURIComponent(request.url)}`, {
        method: request.method,
        headers: tunneledHeaders,
        cache: "no-store"
    });

    const proxyError = response.headers.get("x-trilium-proxy-error");
    if (proxyError) {
        throw new Error(`Native HTTP proxy failed: ${proxyError}`);
    }

    // Header keys from fetch() are already lowercase.
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
        headers[key] = value;
    });
    // fetch() cannot read Set-Cookie, so the interceptor re-exposes it under a safe name;
    // map it back for the worker's cookie jar.
    const setCookie = headers["x-trilium-set-cookie"];
    if (setCookie) {
        headers["set-cookie"] = setCookie;
        delete headers["x-trilium-set-cookie"];
    }

    return { status: response.status, headers, body: await response.text() };
}

/**
 * Native HTTP handler that uses the app's native networking layer.
 *
 * This bypasses the WebView's fetch — no CORS preflight, no SameSite cookie
 * restrictions, and plain HTTP targets work from an HTTPS WebView origin.
 */
export const capacitorHttpHandler: NativeHttpHandler = async (request) => {
    if (canUseNativeProxy(request) && await isNativeProxyAvailable()) {
        try {
            return await nativeProxyFetch(request);
        } catch (e) {
            // Idempotent GET — retrying once over the plugin transport is safe and keeps
            // sync alive if the proxy misbehaves in ways the availability probe missed.
            console.warn("Native HTTP proxy failed, falling back to the plugin transport", e);
        }
    }

    const responseType = request.responseType ?? "text";
    const response = await getHttpPlugin().request({
        method: request.method,
        url: request.url,
        headers: request.headers,
        data: request.body,
        responseType
    });

    // Normalize header keys to lowercase for consistent access in the worker
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
        headers[key.toLowerCase()] = value;
    }

    let body: string;
    if (request.responseType === "arraybuffer") {
        // Both plugins return binary data as a base64 string — pass it through directly
        body = String(response.data);
    } else {
        // TriliumHttp always returns a string. On the CapacitorHttp fallback, JSON responses
        // arrive pre-parsed as an object (see above) and have to be re-serialized for the
        // worker, which parses the body itself.
        body = typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data);
    }

    return { status: response.status, headers, body };
};
