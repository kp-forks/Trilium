// =============================================================================
// ERROR HANDLERS FIRST - No static imports above this!
// ES modules hoist static imports, so they execute BEFORE any code runs.
// We use dynamic imports below to ensure error handlers are registered first.
// =============================================================================

self.onerror = (message, source, lineno, colno, error) => {
    const errorMsg = `[Worker] Uncaught error: ${message}\n  at ${source}:${lineno}:${colno}`;
    console.error(errorMsg, error);
    try {
        self.postMessage({
            type: "WORKER_ERROR",
            error: {
                message: String(message),
                source,
                lineno,
                colno,
                stack: error?.stack || new Error().stack
            }
        });
    } catch (e) {
        console.error("[Worker] Failed to report error:", e);
    }
    return false;
};

self.onunhandledrejection = (event) => {
    const reason = event.reason;
    const errorMsg = `[Worker] Unhandled rejection: ${reason?.message || reason}`;
    console.error(errorMsg, reason);
    try {
        self.postMessage({
            type: "WORKER_ERROR",
            error: {
                message: String(reason?.message || reason),
                stack: reason?.stack || new Error().stack
            }
        });
    } catch (e) {
        console.error("[Worker] Failed to report rejection:", e);
    }
};

console.log("[Worker] Error handlers installed, loading modules...");

// =============================================================================
// TYPE-ONLY IMPORTS (erased at runtime, safe as static imports)
// =============================================================================
import type { BrowserRouter } from './lightweight/browser_router';

// =============================================================================
// MODULE STATE (populated by dynamic imports)
// =============================================================================
let BrowserSqlProvider: typeof import('./lightweight/sql_provider').default;
let WorkerMessagingProvider: typeof import('./lightweight/messaging_provider').default;
let BrowserExecutionContext: typeof import('./lightweight/cls_provider').default;
let BrowserCryptoProvider: typeof import('./lightweight/crypto_provider').default;
let FetchRequestProvider: typeof import('./lightweight/request_provider').default;
let StandalonePlatformProvider: typeof import('./lightweight/platform_provider').default;
let translationProvider: typeof import('./lightweight/translation_provider').default;
let createConfiguredRouter: typeof import('./lightweight/browser_routes').createConfiguredRouter;

// Instance state
let sqlProvider: InstanceType<typeof BrowserSqlProvider> | null = null;
let messagingProvider: InstanceType<typeof WorkerMessagingProvider> | null = null;

// Core module, router, and initialization state
let coreModule: typeof import("@triliumnext/core") | null = null;
let router: BrowserRouter | null = null;
let initPromise: Promise<void> | null = null;
let initError: Error | null = null;
let queryString = "";

/**
 * Load all required modules using dynamic imports.
 * This allows errors to be caught by our error handlers.
 */
async function loadModules(): Promise<void> {
    console.log("[Worker] Loading lightweight modules...");
    const [
        sqlModule,
        messagingModule,
        clsModule,
        cryptoModule,
        requestModule,
        platformModule,
        translationModule,
        routesModule
    ] = await Promise.all([
        import('./lightweight/sql_provider.js'),
        import('./lightweight/messaging_provider.js'),
        import('./lightweight/cls_provider.js'),
        import('./lightweight/crypto_provider.js'),
        import('./lightweight/request_provider.js'),
        import('./lightweight/platform_provider.js'),
        import('./lightweight/translation_provider.js'),
        import('./lightweight/browser_routes.js')
    ]);

    BrowserSqlProvider = sqlModule.default;
    WorkerMessagingProvider = messagingModule.default;
    BrowserExecutionContext = clsModule.default;
    BrowserCryptoProvider = cryptoModule.default;
    FetchRequestProvider = requestModule.default;
    StandalonePlatformProvider = platformModule.default;
    translationProvider = translationModule.default;
    createConfiguredRouter = routesModule.createConfiguredRouter;

    // Create instances
    sqlProvider = new BrowserSqlProvider();
    messagingProvider = new WorkerMessagingProvider();

    console.log("[Worker] Lightweight modules loaded successfully");
}

/**
 * Initialize SQLite WASM and load the core module.
 * This happens once at worker startup.
 */
async function initialize(): Promise<void> {
    if (initPromise) {
        return initPromise; // Already initializing
    }
    if (initError) {
        throw initError; // Failed before, don't retry
    }

    initPromise = (async () => {
        try {
            // First, load all modules dynamically
            await loadModules();

            console.log("[Worker] Initializing SQLite WASM...");
            await sqlProvider!.initWasm();

            // Try to use OPFS for persistent storage
            if (sqlProvider!.isOpfsAvailable()) {
                console.log("[Worker] OPFS available, loading persistent database...");
                sqlProvider!.loadFromOpfs("/trilium.db");
            } else {
                // Fall back to in-memory database (non-persistent)
                console.warn("[Worker] OPFS not available, using in-memory database (data will not persist)");
                console.warn("[Worker] To enable persistence, ensure COOP/COEP headers are set by the server");
                sqlProvider!.loadFromMemory();
            }

            console.log("[Worker] Database loaded");

            console.log("[Worker] Loading @triliumnext/core...");
            const schemaModule = await import("@triliumnext/core/src/assets/schema.sql?raw");
            coreModule = await import("@triliumnext/core");
            await coreModule.initializeCore({
                executionContext: new BrowserExecutionContext(),
                crypto: new BrowserCryptoProvider(),
                messaging: messagingProvider!,
                request: new FetchRequestProvider(),
                platform: new StandalonePlatformProvider(queryString),
                translations: translationProvider,
                schema: schemaModule.default,
                dbConfig: {
                    provider: sqlProvider!,
                    isReadOnly: false,
                    onTransactionCommit: () => {
                        coreModule?.ws.sendTransactionEntityChangesToAllClients();
                    },
                    onTransactionRollback: () => {
                        // No-op for now
                    }
                }
            });
            coreModule.ws.init();

            console.log("[Worker] Supported routes", Object.keys(coreModule.routes));

            // Create and configure the router
            router = createConfiguredRouter();
            console.log("[Worker] Router configured");

            // initializeDb runs initDbConnection inside an execution context,
            // which resolves dbReady — required before beccaLoaded can settle.
            coreModule.sql_init.initializeDb();

            if (coreModule.sql_init.isDbInitialized()) {
                console.log("[Worker] Database already initialized, loading becca...");
                await coreModule.becca_loader.beccaLoaded;
            } else {
                console.log("[Worker] Database not initialized, skipping becca load (will be loaded during DB initialization)");
            }

            console.log("[Worker] Initialization complete");
        } catch (error) {
            initError = error instanceof Error ? error : new Error(String(error));
            console.error("[Worker] Initialization failed:", initError);
            throw initError;
        }
    })();

    return initPromise;
}

/**
 * Ensure the worker is initialized before processing requests.
 * Returns the router if initialization was successful.
 */
async function ensureInitialized() {
    await initialize();
    if (!router) {
        throw new Error("Router not initialized");
    }
    return router;
}

interface LocalRequest {
    method: string;
    url: string;
    body?: unknown;
    headers?: Record<string, string>;
}

// Main dispatch
async function dispatch(request: LocalRequest) {
    // Ensure initialization is complete and get the router
    const appRouter = await ensureInitialized();

    // Dispatch to the router
    return appRouter.dispatch(request.method, request.url, request.body, request.headers);
}

// Start initialization immediately when the worker loads
console.log("[Worker] Starting initialization...");
initialize().catch(err => {
    console.error("[Worker] Initialization failed:", err);
    // Post error to main thread
    self.postMessage({
        type: "WORKER_ERROR",
        error: {
            message: String(err?.message || err),
            stack: err?.stack
        }
    });
});

self.onmessage = async (event) => {
    const msg = event.data;
    if (!msg) return;

    if (msg.type === "INIT") {
        queryString = msg.queryString || "";
        return;
    }

    if (msg.type !== "LOCAL_REQUEST") return;

    const { id, request } = msg;

    try {
        const response = await dispatch(request);

        // Transfer body back (if any) - use options object for proper typing
        (self as unknown as Worker).postMessage({
            type: "LOCAL_RESPONSE",
            id,
            response
        }, { transfer: response.body ? [response.body] : [] });
    } catch (e) {
        console.error("[Worker] Dispatch error:", e);
        (self as unknown as Worker).postMessage({
            type: "LOCAL_RESPONSE",
            id,
            error: String((e as Error)?.message || e)
        });
    }
};
