import electron from "electron";
import EventEmitter from "events";
import type { Application } from "express";
import { createRequest, createResponse } from "node-mocks-http";

/**
 * Bridges renderer-process requests on the `trilium-app://app/...` custom
 * protocol into the Express application running in the main process.
 *
 * The renderer loads the entire UI from this scheme (see
 * `apps/server/src/services/window.ts` and `apps/desktop/src/main.ts`), so
 * every request the page makes — page load, bootstrap, API calls, static
 * assets — arrives here as a Web Fetch `Request`. We convert it into an
 * Express `req`/`res` pair via `node-mocks-http` and dispatch through the
 * app, giving us the real session, CSRF, body-parser and error middleware
 * without any FakeRequest workaround.
 */
function init(app: Application) {
    electron.app.whenReady().then(() => {
        electron.protocol.handle("trilium-app", async (request) => {
            try {
                return await dispatch(app, request);
            } catch (err) {
                console.error(`[trilium-app] dispatch failed for ${request.method} ${request.url}:`, err);
                return new Response(String((err as Error)?.stack ?? err), { status: 500 });
            }
        });
    });
}

async function dispatch(app: Application, request: Request): Promise<Response> {
    const url = new URL(request.url);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
        headers[key] = value;
    });

    const body = await readBody(request);

    return new Promise<Response>((resolve, reject) => {
        const req = createRequest({
            method: request.method as any,
            url: url.pathname + url.search,
            headers,
            body: body as any,
            // Give express-rate-limit and any other IP-based middleware
            // something to key on; the bare mock would have `req.ip` undefined.
            ...({
                connection: { remoteAddress: "127.0.0.1" },
                socket: { remoteAddress: "127.0.0.1" },
                ip: "127.0.0.1"
            } as object)
        });

        // body-parser short-circuits when `_body` is already set, so the
        // pre-parsed JSON / buffer above won't be re-read from an empty mock
        // stream and clobbered.
        if (body !== undefined) {
            (req as any)._body = true;
        }

        const res = createResponse({
            req,
            eventEmitter: EventEmitter
        });

        res.on("end", () => {
            const buf = typeof (res as any)._getBuffer === "function" ? (res as any)._getBuffer() : null;
            const data = res._getData();
            const rawPayload = buf && buf.length > 0 ? buf : data;
            try {
                resolve(new Response(toUint8Array(rawPayload) as BodyInit | null, {
                    status: res.statusCode,
                    headers: normalizeResponseHeaders(res.getHeaders())
                }));
            } catch (err) {
                reject(err);
            }
        });

        try {
            (app as unknown as (req: object, res: object, next: (err?: unknown) => void) => void)(
                req,
                res,
                (err) => {
                    if (err) reject(err);
                }
            );
        } catch (err) {
            reject(err);
        }
    });
}

async function readBody(request: Request): Promise<unknown> {
    if (request.method === "GET" || request.method === "HEAD" || !request.body) {
        return undefined;
    }

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        const text = await request.text();
        return text ? JSON.parse(text) : undefined;
    }

    // For form uploads and binary payloads, hand Express a Buffer; multer
    // / body-parser will read it via the content-type header.
    return Buffer.from(await request.arrayBuffer());
}

// Headers that either describe HTTP transport framing or assume an https
// origin. Letting them through on the `trilium-app://` custom scheme
// causes Chromium to abort the renderer with STATUS_BREAKPOINT — HSTS /
// COOP / CORP / origin-agent-cluster all run as part of renderer process
// setup and trip internal asserts when the scheme isn't http(s).
// Content-Length / Transfer-Encoding from Express also don't match what
// the renderer ends up reading, since we hand it a buffered body.
const STRIPPED_HEADERS = new Set([
    "content-length",
    "transfer-encoding",
    "connection",
    "keep-alive",
    "upgrade",
    "te",
    "trailer",
    "strict-transport-security",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
    "cross-origin-embedder-policy",
    "origin-agent-cluster"
]);

function normalizeResponseHeaders(headers: Record<string, number | string | string[] | undefined>): [string, string][] {
    const out: [string, string][] = [];
    for (const [name, value] of Object.entries(headers)) {
        if (value === undefined) continue;
        if (STRIPPED_HEADERS.has(name.toLowerCase())) continue;
        if (Array.isArray(value)) {
            for (const v of value) out.push([name, v]);
        } else {
            out.push([name, String(value)]);
        }
    }
    return out;
}

// Copy whatever node-mocks-http handed us into a fresh Uint8Array the
// Fetch `Response` fully owns. Passing a shared Buffer can leave Chromium
// with a reference that's freed underneath it.
function toUint8Array(payload: unknown): Uint8Array | null {
    if (payload == null) return null;
    if (payload instanceof Uint8Array) return new Uint8Array(payload);
    if (typeof payload === "string") return new TextEncoder().encode(payload);
    if (typeof payload === "object") return new TextEncoder().encode(JSON.stringify(payload));
    return new TextEncoder().encode(String(payload));
}

export default init;
