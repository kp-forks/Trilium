import { HttpError } from "../errors";
import * as routes from "../routes";
import { getContext } from "../services/context";
import entityChanges from "../services/entity_changes";
import { getSql } from "../services/sql/index";

/**
 * In-process, transport-agnostic test driver for the **shared core API routes**
 * (the ones registered by `routes.buildSharedApiRoutes`). Think of it as
 * "supertest for core": it drives the exact same handlers that the Express
 * server (`apps/server`) and the standalone browser router
 * (`apps/standalone/.../browser_routes.ts`) expose, but without an HTTP server,
 * Express, or a socket — so the same spec runs under **both** the node
 * (better-sqlite3) and the standalone (sql.js WASM) test suites.
 *
 * It exercises the real request lifecycle around each handler:
 *   - path/param + query parsing (Express-style `:param`)
 *   - the execution context (cls) and SQL transaction wrapping
 *   - `convertEntitiesToPojo` + the `[statusCode, body]` / `undefined → 204`
 *     result-handler conventions
 *   - `HttpError` → status mapping (404 / 400 / 403 …)
 *   - JSON round-tripping of the response body (so e.g. dates surface as the
 *     strings an HTTP client would actually receive)
 *
 * It deliberately does **not** run the platform middleware (auth, CSRF, rate
 * limiting, multipart parsing) — those are server/Express concerns and are
 * covered by the supertest specs in `apps/server`. Auth/CSRF are treated as
 * always-passing here, mirroring the standalone browser adapter.
 */

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

type Handler = (req: ApiRequest, res?: MockResponse) => unknown;
type ResultHandler = (req: ApiRequest, res: CaptureResponse, result: unknown) => void;

interface ApiRequest {
    params: Record<string, string>;
    query: Record<string, string | undefined>;
    body: unknown;
    headers: Record<string, string>;
    method: string;
    file?: unknown;
    originalUrl: string;
}

interface RegisteredRoute {
    method: string;
    pattern: RegExp;
    paramNames: string[];
    run: (req: ApiRequest) => Promise<TestResponse>;
}

export interface TestResponse<T = unknown> {
    status: number;
    headers: Record<string, string>;
    body: T;
}

export interface RequestOptions {
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
}

function pathToRegex(path: string): { pattern: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];
    // Drop a trailing slash from the registered path and allow an optional one
    // when matching, mirroring Express's default (non-strict) routing — several
    // core routes are registered with a trailing slash (e.g. /api/attribute-names/).
    const normalized = path.replace(/\/$/, "");
    const regexPattern = normalized
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, paramName) => {
            paramNames.push(paramName);
            return "([^/]+)";
        });
    return { pattern: new RegExp(`^${regexPattern}\\/?$`), paramNames };
}

function jsonRoundTrip(value: unknown): unknown {
    if (value === undefined || typeof value === "string") {
        return value;
    }
    return JSON.parse(JSON.stringify(value));
}

/** Mirrors the server's `apiResultHandler` / browser `formatResult` conventions. */
function formatApiResult(result: unknown): TestResponse {
    const headers: Record<string, string> = {
        "trilium-max-entity-change-id": String(entityChanges.getMaxEntityChangeId())
    };
    const pojo = routes.convertEntitiesToPojo(result);

    if (Array.isArray(pojo) && pojo.length > 0 && Number.isInteger(pojo[0])) {
        const [ status, response ] = pojo as [number, unknown];
        return { status, headers, body: jsonRoundTrip(response) };
    }
    if (pojo === undefined) {
        return { status: 204, headers, body: undefined };
    }
    return { status: 200, headers, body: jsonRoundTrip(pojo) };
}

/** Captures what a result handler writes, for the `route(..., resultHandler)` path. */
interface CaptureResponse {
    captured?: TestResponse;
    setHeader(name: string, value: string): void;
}

/** A minimal Express-like response for handlers that write directly (e.g. image routes). */
interface MockResponse {
    used: boolean;
    status(code: number): MockResponse;
    set(name: string, value: string): MockResponse;
    setHeader(name: string, value: string): MockResponse;
    send(body: unknown): MockResponse;
    sendStatus(code: number): MockResponse;
}

function createMockResponse(): MockResponse & { snapshot(): TestResponse } {
    const headers: Record<string, string> = {};
    const state = { status: 200, body: undefined as unknown };
    const res: MockResponse & { snapshot(): TestResponse } = {
        used: false,
        status(code) { state.status = code; return res; },
        set(name, value) { headers[name] = value; return res; },
        setHeader(name, value) { headers[name] = value; return res; },
        send(body) { res.used = true; state.body = body; return res; },
        sendStatus(code) { res.used = true; state.status = code; return res; },
        snapshot() { return { status: state.status, headers, body: jsonRoundTrip(state.body) }; }
    };
    return res;
}

export class CoreApiTester {

    private routes: RegisteredRoute[] = [];

    private add(method: string, path: string, run: (req: ApiRequest) => Promise<TestResponse>) {
        const { pattern, paramNames } = pathToRegex(path);
        this.routes.push({ method: method.toUpperCase(), pattern, paramNames, run });
    }

    /** Builds a tester with every shared core route registered. */
    static build(): CoreApiTester {
        const tester = new CoreApiTester();
        tester.registerAll();
        return tester;
    }

    private registerAll() {
        const apiRoute = (method: HttpMethod, path: string, handler: Handler) =>
            this.add(method, path, async (req) => {
                const result = await getContext().init(() =>
                    getSql().transactional(() => handler(req)));
                return formatApiResult(result);
            });

        const asyncApiRoute = (method: HttpMethod, path: string, handler: Handler) =>
            this.add(method, path, async (req) => {
                const result = await getContext().init(async () => await handler(req));
                return formatApiResult(result);
            });

        const buildRoute = (transactional: boolean) =>
            (
                method: HttpMethod,
                path: string,
                _mw: unknown[],
                handler: Handler,
                resultHandler?: ResultHandler | null
            ) =>
                this.add(method, path, async (req) => {
                    const mockRes = createMockResponse();
                    const invoke = () => handler(req, mockRes);
                    const result = transactional
                        ? await getContext().init(() => getSql().transactional(invoke))
                        : await getContext().init(async () => await invoke());

                    if (mockRes.used) {
                        return mockRes.snapshot();
                    }
                    if (resultHandler) {
                        const capture: CaptureResponse = { setHeader() {} };
                        resultHandler(req, capture, result);
                        return capture.captured ?? formatApiResult(result);
                    }
                    return formatApiResult(result);
                });

        const apiResultHandler: ResultHandler = (_req, res, result) => {
            res.captured = formatApiResult(result);
        };
        const noop = () => {};

        routes.buildSharedApiRoutes({
            route: buildRoute(true),
            asyncRoute: buildRoute(false),
            apiRoute,
            asyncApiRoute,
            apiResultHandler,
            checkApiAuth: noop,
            checkApiAuthOrElectron: noop,
            checkAppNotInitialized: noop,
            checkCredentials: noop,
            loginRateLimiter: noop,
            uploadMiddlewareWithErrorHandling: noop,
            csrfMiddleware: noop
        });
    }

    async request<T = unknown>(
        method: HttpMethod,
        path: string,
        opts: RequestOptions = {}
    ): Promise<TestResponse<T>> {
        const url = new URL(path, "http://core.test");
        for (const [ key, value ] of Object.entries(opts.query ?? {})) {
            if (value !== undefined) {
                url.searchParams.set(key, String(value));
            }
        }

        const query: Record<string, string | undefined> = {};
        for (const [ key, value ] of url.searchParams) {
            query[key] = value;
        }

        const upperMethod = method.toUpperCase();
        for (const route of this.routes) {
            if (route.method !== upperMethod) {
                continue;
            }
            const match = url.pathname.match(route.pattern);
            if (!match) {
                continue;
            }

            const params: Record<string, string> = {};
            route.paramNames.forEach((name, i) => {
                params[name] = decodeURIComponent(match[i + 1]);
            });

            const req: ApiRequest = {
                params,
                query,
                body: opts.body,
                headers: opts.headers ?? {},
                method: upperMethod,
                originalUrl: url.pathname + url.search
            };

            try {
                return (await route.run(req)) as TestResponse<T>;
            } catch (e) {
                const status = e instanceof HttpError ? e.statusCode : 500;
                const message = e instanceof Error ? e.message : String(e);
                return { status, headers: {}, body: { message } as T };
            }
        }

        const message = `No route for ${upperMethod} ${url.pathname}`;
        return { status: 404, headers: {}, body: { message } as T };
    }

    get<T = unknown>(path: string, opts?: RequestOptions) {
        return this.request<T>("get", path, opts);
    }

    post<T = unknown>(path: string, opts?: RequestOptions) {
        return this.request<T>("post", path, opts);
    }

    put<T = unknown>(path: string, opts?: RequestOptions) {
        return this.request<T>("put", path, opts);
    }

    patch<T = unknown>(path: string, opts?: RequestOptions) {
        return this.request<T>("patch", path, opts);
    }

    delete<T = unknown>(path: string, opts?: RequestOptions) {
        return this.request<T>("delete", path, opts);
    }

}
