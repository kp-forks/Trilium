/**
 * Browser route definitions.
 * This integrates with the shared route builder from @triliumnext/core.
 */

import { BootstrapDefinition } from '@triliumnext/commons';
import { entity_changes, getContext, getSharedBootstrapItems, getSql, routes } from '@triliumnext/core';

import packageJson from '../../package.json' with { type: 'json' };
import { type BrowserRequest, BrowserRouter } from './browser_router';

/** Minimal response object used by apiResultHandler to capture the processed result. */
interface ResultHandlerResponse {
    headers: Record<string, string>;
    result: unknown;
    setHeader(name: string, value: string): void;
}

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Creates an Express-like request object from a BrowserRequest.
 */
function toExpressLikeReq(req: BrowserRequest) {
    return {
        params: req.params,
        query: req.query,
        body: req.body,
        headers: req.headers ?? {},
        method: req.method,
        get originalUrl() { return req.url; }
    };
}

/**
 * Extracts context headers from the request and sets them in the execution context,
 * mirroring what the server does in route_api.ts.
 */
function setContextFromHeaders(req: BrowserRequest) {
    const headers = req.headers ?? {};
    const ctx = getContext();
    ctx.set("componentId", headers["trilium-component-id"]);
    ctx.set("localNowDateTime", headers["trilium-local-now-datetime"]);
    ctx.set("hoistedNoteId", headers["trilium-hoisted-note-id"] || "root");
}

/**
 * Wraps a core route handler to work with the BrowserRouter.
 * Core handlers expect an Express-like request object with params, query, and body.
 * Each request is wrapped in an execution context (like cls.init() on the server)
 * to ensure entity change tracking works correctly.
 */
function wrapHandler(handler: (req: any) => unknown, transactional: boolean) {
    return (req: BrowserRequest) => {
        return getContext().init(() => {
            setContextFromHeaders(req);
            const expressLikeReq = toExpressLikeReq(req);
            if (transactional) {
                return getSql().transactional(() => handler(expressLikeReq));
            }
            return handler(expressLikeReq);
        });
    };
}

/**
 * Creates an apiRoute function compatible with buildSharedApiRoutes.
 * This bridges the core's route registration to the BrowserRouter.
 */
function createApiRoute(router: BrowserRouter, transactional: boolean) {
    return (method: HttpMethod, path: string, handler: (req: any) => unknown) => {
        router.register(method, path, wrapHandler(handler, transactional));
    };
}

/**
 * Low-level route registration matching the server's `route()` signature:
 *   route(method, path, middleware[], handler, resultHandler)
 *
 * In standalone mode:
 * - Middleware (e.g. checkApiAuth) is skipped — there's no authentication.
 * - The resultHandler is applied to post-process the result (entity conversion, status codes).
 */
function createRoute(router: BrowserRouter) {
    return (method: HttpMethod, path: string, _middleware: any[], handler: (req: any) => unknown, resultHandler?: ((req: any, res: any, result: unknown) => unknown) | null) => {
        router.register(method, path, (req: BrowserRequest) => {
            return getContext().init(() => {
                setContextFromHeaders(req);
                const expressLikeReq = toExpressLikeReq(req);
                const result = getSql().transactional(() => handler(expressLikeReq));

                if (resultHandler) {
                    // Create a minimal response object that captures what apiResultHandler sets.
                    const res = createResultHandlerResponse();
                    resultHandler(expressLikeReq, res, result);
                    return res.result;
                }

                return result;
            });
        });
    };
}

/**
 * Standalone apiResultHandler matching the server's behavior:
 * - Converts Becca entities to POJOs
 * - Handles [statusCode, response] tuple format
 * - Sets trilium-max-entity-change-id (captured in response headers)
 */
function apiResultHandler(_req: any, res: ResultHandlerResponse, result: unknown) {
    res.headers["trilium-max-entity-change-id"] = String(entity_changes.getMaxEntityChangeId());
    result = routes.convertEntitiesToPojo(result);

    if (Array.isArray(result) && result.length > 0 && Number.isInteger(result[0])) {
        const [_statusCode, response] = result;
        res.result = response;
    } else if (result === undefined) {
        res.result = "";
    } else {
        res.result = result;
    }
}

/**
 * No-op auth middleware for standalone — there's no authentication.
 */
function checkApiAuth() {
    // No authentication in standalone mode.
}

/**
 * Creates a minimal response-like object for the apiResultHandler.
 */
function createResultHandlerResponse(): ResultHandlerResponse {
    return {
        headers: {},
        result: undefined,
        setHeader(name: string, value: string) {
            this.headers[name] = value;
        }
    };
}

/**
 * Register all API routes on the browser router using the shared builder.
 *
 * @param router - The browser router instance
 */
export function registerRoutes(router: BrowserRouter): void {
    const apiRoute = createApiRoute(router, true);
    routes.buildSharedApiRoutes({
        route: createRoute(router),
        apiRoute,
        asyncApiRoute: createApiRoute(router, false),
        apiResultHandler,
        checkApiAuth
    });
    apiRoute('get', '/bootstrap', bootstrapRoute);

    // Dummy routes for compatibility.
    apiRoute("get", "/api/script/widgets", () => []);
    apiRoute("get", "/api/script/startup", () => []);
    apiRoute("get", "/api/system-checks", () => ({ isCpuArchMismatch: false }));
}

function bootstrapRoute() {
    const assetPath = ".";

    return {
        ...getSharedBootstrapItems(assetPath),
        appPath: assetPath,
        device: false, // Let the client detect device type.
        csrfToken: "dummy-csrf-token",
        themeCssUrl: false,
        themeUseNextAsBase: "next",
        triliumVersion: packageJson.version,
        baseApiUrl: "../api/",
        headingStyle: "plain",
        layoutOrientation: "vertical",
        platform: "web",
        isDev: import.meta.env.DEV,
        isMainWindow: true,
        isElectron: false,
        isStandalone: true,
        hasNativeTitleBar: false,
        hasBackgroundEffects: false,

        // TODO: Fill properly
        currentLocale: { id: "en", name: "English", rtl: false },
        isRtl: false,
        instanceName: null,
        appCssNoteIds: [],
        TRILIUM_SAFE_MODE: false
    } satisfies BootstrapDefinition;
}

/**
 * Create and configure a router with all routes registered.
 */
export function createConfiguredRouter(): BrowserRouter {
    const router = new BrowserRouter();
    registerRoutes(router);
    return router;
}
