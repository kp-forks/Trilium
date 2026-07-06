import { isLocalApiRequest, localFetch } from "./local-bridge.js";

/**
 * iOS-only request interceptors.
 *
 * iOS Capacitor loads the app on the `capacitor://` scheme, and WebKit refuses
 * to register a service worker for a non-HTTP(S) origin. The standalone stack
 * normally routes the client's API/sync calls to the in-browser SQLite worker
 * through that service worker (this is what Android — served on `https://` via
 * `androidScheme` — and the web build both rely on). Since the SW can't exist
 * under `capacitor://`, these three interceptors stand in for it, each catching
 * a request path the SW would otherwise handle:
 *
 *   - {@link setupFetchInterceptor} — `window.fetch` calls to the local API.
 *   - {@link setupXhrInterceptor}   — `XMLHttpRequest` (jQuery `$.ajax`), which
 *                                     does not go through `window.fetch`.
 *   - {@link setupImageInterceptor} — `<img src="api/images/…">` loads, which
 *                                     the browser's internal image loader issues
 *                                     without touching fetch or XHR.
 *
 * The caller gates this on `location.protocol === "capacitor:"`, so none of it
 * runs on Android or the web build.
 */
export function installIosInterceptors() {
    setupFetchInterceptor();
    setupXhrInterceptor();
    setupImageInterceptor();
}

export function setupFetchInterceptor() {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const urlStr = typeof input === "string" ? input
            : input instanceof URL ? input.href
                : (input as Request).url;
        const url = new URL(urlStr, location.href);
        if (url.origin === location.origin && isLocalApiRequest(url)) {
            return localFetch(new Request(input, init));
        }
        return originalFetch(input, init);
    };
}

// <img src="api/images/..."> requests are issued by the browser's internal
// image loader — they don't go through window.fetch or XMLHttpRequest, so the
// other interceptors can't catch them. On the capacitor:// scheme there is
// also no Service Worker to fall back on (WebKit only registers SWs for
// http/https origins), so the request hits Capacitor's URL scheme handler,
// which has no idea about /api/images/... and silently 404s — that's the
// broken-image placeholder users see in the iOS app.
//
// Watch the DOM for <img> elements whose src points at a local API path and
// transparently swap the src to a blob: URL backed by the SQLite worker. This
// catches images added via HTML parsing (initial document, innerHTML), via
// setAttribute/attr (jQuery, content_renderer), and via the src property.
// Setting the same src again on the same element is deduplicated so we don't
// re-fetch on idempotent re-renders.
export function setupImageInterceptor() {
    const lastProcessedSrc = new WeakMap<HTMLImageElement, string>();
    // Object URLs are held by the browser until explicitly revoked (the SPA
    // document never unloads), so track the one currently assigned to each <img>
    // and revoke it whenever the image is repointed or removed — otherwise every
    // image swap leaks memory, which matters most on the constrained iOS WebView.
    const blobUrls = new WeakMap<HTMLImageElement, string>();

    function matchesLocalApi(value: string): URL | null {
        if (!value || value.startsWith("blob:") || value.startsWith("data:")) return null;
        let abs: URL;
        try {
            abs = new URL(value, location.href);
        } catch {
            return null;
        }
        return (abs.origin === location.origin && isLocalApiRequest(abs)) ? abs : null;
    }

    function releaseBlobUrl(img: HTMLImageElement) {
        const previous = blobUrls.get(img);
        if (previous) {
            URL.revokeObjectURL(previous);
            blobUrls.delete(img);
        }
    }

    async function swapToBlob(img: HTMLImageElement, originalSrc: string, absUrl: URL) {
        if (lastProcessedSrc.get(img) === originalSrc) return;
        lastProcessedSrc.set(img, originalSrc);

        try {
            const resp = await localFetch(new Request(absUrl.toString()));
            if (!resp.ok) {
                lastProcessedSrc.delete(img);
                return;
            }
            const blob = await resp.blob();
            // Free the URL from a prior swap on this same element before replacing it.
            releaseBlobUrl(img);
            const blobUrl = URL.createObjectURL(blob);
            blobUrls.set(img, blobUrl);
            img.setAttribute("src", blobUrl);
        } catch (err) {
            console.warn("[ImageInterceptor] Failed to load", absUrl.href, err);
            lastProcessedSrc.delete(img);
        }
    }

    function checkImage(img: HTMLImageElement) {
        const src = img.getAttribute("src");
        if (!src) return;
        const absUrl = matchesLocalApi(src);
        if (absUrl) void swapToBlob(img, src, absUrl);
    }

    const observer = new MutationObserver((records) => {
        for (const record of records) {
            if (record.type === "attributes" && record.attributeName === "src" && record.target instanceof HTMLImageElement) {
                checkImage(record.target);
            } else if (record.type === "childList") {
                for (const node of record.addedNodes) {
                    if (node instanceof HTMLImageElement) {
                        checkImage(node);
                    } else if (node instanceof Element) {
                        node.querySelectorAll("img").forEach((img) => checkImage(img as HTMLImageElement));
                    }
                }
                for (const node of record.removedNodes) {
                    if (node instanceof HTMLImageElement) {
                        releaseBlobUrl(node);
                    } else if (node instanceof Element) {
                        node.querySelectorAll("img").forEach((img) => releaseBlobUrl(img as HTMLImageElement));
                    }
                }
            }
        }
    });

    function start() {
        observer.observe(document.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["src"]
        });
        document.querySelectorAll("img").forEach((img) => checkImage(img as HTMLImageElement));
    }

    if (document.documentElement) {
        start();
    } else {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    }
}

// jQuery $.ajax uses XMLHttpRequest, which window.fetch interception does not
// catch. On the capacitor:// scheme there is no Service Worker to route
// requests, so XHR-bound API calls would hit the native bridge and return
// something other than the expected JSON. Route them through the local worker.
export function setupXhrInterceptor() {
    const OriginalXHR = window.XMLHttpRequest;

    class PatchedXHR extends OriginalXHR {
        private _ti_method = "GET";
        private _ti_url = "";
        private _ti_intercept = false;
        private _ti_headers: Record<string, string> = {};
        private _ti_responseType: XMLHttpRequestResponseType = "";

        open(method: string, url: string | URL, async?: boolean, user?: string | null, password?: string | null) {
            const urlStr = typeof url === "string" ? url : url.href;
            const abs = new URL(urlStr, location.href);
            this._ti_method = method;
            this._ti_url = abs.href;
            this._ti_intercept = abs.origin === location.origin && isLocalApiRequest(abs);
            this._ti_headers = {};
            if (!this._ti_intercept) {
                return super.open(method, url as string, async ?? true, user ?? null, password ?? null);
            }
        }

        setRequestHeader(name: string, value: string) {
            if (!this._ti_intercept) return super.setRequestHeader(name, value);
            this._ti_headers[name] = value;
        }

        get responseType(): XMLHttpRequestResponseType {
            if (this._ti_intercept) return this._ti_responseType;
            return super.responseType;
        }

        set responseType(value: XMLHttpRequestResponseType) {
            if (this._ti_intercept) {
                this._ti_responseType = value;
                return;
            }
            super.responseType = value;
        }

        send(body?: Document | XMLHttpRequestBodyInit | null) {
            if (!this._ti_intercept) return super.send(body);

            const init: RequestInit = { method: this._ti_method, headers: this._ti_headers };
            if (body != null && this._ti_method !== "GET" && this._ti_method !== "HEAD") {
                init.body = body as BodyInit;
            }

            void (async () => {
                try {
                    const resp = await localFetch(new Request(this._ti_url, init));
                    const buffer = await resp.arrayBuffer();
                    const text = new TextDecoder().decode(buffer);

                    let parsedResponse: unknown = text;
                    if (this._ti_responseType === "json") {
                        try { parsedResponse = JSON.parse(text); } catch { parsedResponse = null; }
                    } else if (this._ti_responseType === "arraybuffer") {
                        parsedResponse = buffer;
                    } else if (this._ti_responseType === "blob") {
                        parsedResponse = new Blob([buffer], { type: resp.headers.get("content-type") ?? "" });
                    }

                    const headerLines = [...resp.headers.entries()]
                        .map(([k, v]) => `${k}: ${v}`).join("\r\n");

                    Object.defineProperty(this, "readyState", { value: 4, configurable: true });
                    Object.defineProperty(this, "status", { value: resp.status, configurable: true });
                    Object.defineProperty(this, "statusText", { value: resp.statusText, configurable: true });
                    Object.defineProperty(this, "responseURL", { value: this._ti_url, configurable: true });
                    Object.defineProperty(this, "responseText", {
                        get: () => {
                            if (this._ti_responseType && this._ti_responseType !== "text") {
                                throw new DOMException(
                                    "responseText is only available when responseType is '' or 'text'",
                                    "InvalidStateError"
                                );
                            }
                            return text;
                        },
                        configurable: true,
                    });
                    Object.defineProperty(this, "response", { value: parsedResponse, configurable: true });
                    Object.defineProperty(this, "getAllResponseHeaders", {
                        value: () => headerLines,
                        configurable: true,
                    });
                    Object.defineProperty(this, "getResponseHeader", {
                        value: (name: string) => resp.headers.get(name),
                        configurable: true,
                    });

                    this.dispatchEvent(new Event("readystatechange"));
                    this.dispatchEvent(new ProgressEvent("load"));
                    this.dispatchEvent(new ProgressEvent("loadend"));
                } catch {
                    Object.defineProperty(this, "readyState", { value: 4, configurable: true });
                    Object.defineProperty(this, "status", { value: 0, configurable: true });
                    this.dispatchEvent(new Event("readystatechange"));
                    this.dispatchEvent(new ProgressEvent("error"));
                    this.dispatchEvent(new ProgressEvent("loadend"));
                }
            })();
        }
    }

    window.XMLHttpRequest = PatchedXHR as unknown as typeof XMLHttpRequest;
}
