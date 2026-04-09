import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { initializeCore } from "@triliumnext/core";
import schemaSql from "@triliumnext/core/src/assets/schema.sql?raw";
import { beforeAll } from "vitest";

import BrowserExecutionContext from "./lightweight/cls_provider.js";
import BrowserCryptoProvider from "./lightweight/crypto_provider.js";
import BrowserSqlProvider from "./lightweight/sql_provider.js";
import BrowserZipProvider from "./lightweight/zip_provider.js";

// =============================================================================
// SQLite WASM compatibility shims
// =============================================================================
// The @sqlite.org/sqlite-wasm package loads its .wasm via fetch, and its
// bundled `instantiateWasm` hook overrides any user-supplied alternative.
// Two things go wrong under vitest + happy-dom:
//   1. happy-dom's `fetch()` refuses `file://` URLs.
//   2. happy-dom installs its own Response global, which Node's
//      `WebAssembly.instantiateStreaming` rejects ("Received an instance of
//      Response" — it wants undici's Response).
// We intercept fetch for file:// URLs ourselves and force instantiateStreaming
// to fall back to the ArrayBuffer path.
const fileFetchCache = new Map<string, ArrayBuffer>();

function readFileAsArrayBuffer(url: string): ArrayBuffer {
    let cached = fileFetchCache.get(url);
    if (!cached) {
        const bytes = readFileSync(fileURLToPath(url));
        cached = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        fileFetchCache.set(url, cached);
    }
    return cached;
}

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
        ? input
        : input instanceof URL
            ? input.href
            : input.url;

    if (url.startsWith("file://")) {
        const body = readFileAsArrayBuffer(url);
        return new Response(body, {
            status: 200,
            headers: { "Content-Type": "application/wasm" }
        });
    }

    return originalFetch(input as RequestInfo, init);
}) as typeof fetch;

WebAssembly.instantiateStreaming = (async (source, importObject) => {
    const response = await source;
    const bytes = await response.arrayBuffer();
    return WebAssembly.instantiate(bytes, importObject);
}) as typeof WebAssembly.instantiateStreaming;

// =============================================================================
// Core initialization for standalone-flavored tests
// =============================================================================
// Mirror what apps/client-standalone/src/local-server-worker.ts does at
// startup, but without messaging / requests / OPFS / demo archives. We just
// need core to be initialized so that pure-becca / pure-search tests can run.

beforeAll(async () => {
    const sqlProvider = new BrowserSqlProvider();
    await sqlProvider.initWasm();
    sqlProvider.loadFromMemory();
    // Apply the schema so search/becca tests that touch SQL find real tables.
    sqlProvider.exec(schemaSql);

    await initializeCore({
        executionContext: new BrowserExecutionContext(),
        crypto: new BrowserCryptoProvider(),
        zip: new BrowserZipProvider(),
        zipExportProviderFactory: (
            await import("./lightweight/zip_export_provider_factory.js")
        ).standaloneZipExportProviderFactory,
        // Stub translations: pure-becca tests don't need real i18n strings.
        translations: async () => undefined,
        platform: {
            isElectron: false,
            isMac: false,
            isWindows: false,
            crash: (msg: string) => {
                throw new Error(`Platform crash: ${msg}`);
            },
            getEnv: () => undefined
        },
        schema: schemaSql,
        dbConfig: {
            provider: sqlProvider,
            isReadOnly: false,
            onTransactionCommit: () => {},
            onTransactionRollback: () => {}
        }
    });
});
