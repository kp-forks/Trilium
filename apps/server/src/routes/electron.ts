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
 * Express `req`/`res` pair via `node-mocks-http` and dispatch through
 * `app.handle`, giving us the real session, CSRF, body-parser and error
 * middleware without any FakeRequest workaround.
 */
function init(app: Application) {
    electron.app.whenReady().then(() => {
        electron.protocol.handle("trilium-app", (request) => dispatch(app, request));
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
            body: body as any
        });

        // body-parser short-circuits when `_body` is already set, so pre-parsed
        // JSON / buffers above won't be re-read from an empty mock stream and
        // clobbered.
        if (body !== undefined) {
            (req as any)._body = true;
        }

        const res = createResponse({
            req,
            eventEmitter: EventEmitter
        });

        res.on("end", () => {
            const payload = res._getBuffer().length > 0 ? res._getBuffer() : res._getData();
            resolve(new Response(payload ?? null, {
                status: res.statusCode,
                headers: normalizeResponseHeaders(res.getHeaders())
            }));
        });

        try {
            app(req as any, res as any, (err: unknown) => {
                if (err) reject(err);
            });
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
    // / body-parser will treat it as the raw request body via the
    // content-type header.
    return Buffer.from(await request.arrayBuffer());
}

function normalizeResponseHeaders(headers: Record<string, number | string | string[] | undefined>): HeadersInit {
    const out: [string, string][] = [];
    for (const [name, value] of Object.entries(headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
            for (const v of value) out.push([name, v]);
        } else {
            out.push([name, String(value)]);
        }
    }
    return out;
}

export default init;
