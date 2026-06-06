import type { CompletionSource } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";

import backendApiDts from "./backend_api.js";

/**
 * Full IntelliSense for backend/frontend script notes.
 *
 * Runs the real TypeScript language service (via `@typescript/vfs` +
 * `@valtown/codemirror-ts`) over the script source, fed with a curated
 * declaration of Trilium's `api` global. This replaces the ESLint-based
 * linting for these two MIME types with type-aware completion, hover docs
 * and diagnostics from a single source.
 *
 * Everything here is dynamically imported so the TypeScript compiler (a large
 * dependency) is only pulled into a lazy chunk when a script note is opened —
 * plain code notes never load it.
 */

export const SCRIPT_MIME_FRONTEND = "application/javascript;env=frontend";
export const SCRIPT_MIME_BACKEND = "application/javascript;env=backend";
/**
 * JSX render notes. They run in the browser like frontend scripts but are
 * transpiled (sucrase) to Preact `h`/`Fragment` calls before execution — see
 * `buildJsx` in `packages/trilium-core/src/services/script.ts`.
 */
export const SCRIPT_MIME_JSX = "text/jsx";

export function isScriptMime(mime: string): boolean {
    return mime === SCRIPT_MIME_FRONTEND || mime === SCRIPT_MIME_BACKEND || mime === SCRIPT_MIME_JSX;
}

/** Frontend and JSX scripts share the browser runtime (frontend `api`, jQuery). */
function isFrontendMime(mime: string): boolean {
    return mime === SCRIPT_MIME_FRONTEND || mime === SCRIPT_MIME_JSX;
}

const SCRIPT_PATH = "/script.js";
// TypeScript only parses JSX when the source file has a `.tsx`/`.jsx` extension,
// so JSX notes get their own virtual path.
const JSX_SCRIPT_PATH = "/script.tsx";
/** Ambient file declaring the `api` global (a bridge for frontend, the curated stub for backend). */
const API_GLOBALS_PATH = "/trilium-api.d.ts";
/** The shared public API types module (frontend), injected verbatim from commons. */
const API_TYPES_PATH = "/trilium-script-api.ts";
const JQUERY_DTS_PATH = "/jquery-globals.d.ts";
const TRILIUM_MODULES_DTS_PATH = "/trilium-modules.d.ts";

/** The virtual source-file path used for a given script MIME type. */
function scriptPath(mime: string): string {
    return mime === SCRIPT_MIME_JSX ? JSX_SCRIPT_PATH : SCRIPT_PATH;
}

const COMPILER_OPTIONS = {
    // `target`/`lib` are filled in lazily once TypeScript is loaded (needs the ts enums).
    allowJs: true,
    checkJs: true,
    // Script notes are loose JS — `@typescript/vfs` forces `strict: true`, which makes
    // every untyped parameter a TS7006 ("implicitly has an 'any' type") error. Keep the
    // useful semantic checks (unknown api members, wrong arg counts) but don't nag about
    // missing type annotations.
    noImplicitAny: false,
    // `@typescript/vfs` defaults moduleResolution to the legacy `node10`, which
    // TypeScript 6 rejects unless deprecations are explicitly silenced.
    ignoreDeprecations: "6.0"
};

async function createEnv(mime: string) {
    const tsModule = await import("typescript");
    const ts = tsModule.default ?? tsModule;
    const { createSystem, createVirtualTypeScriptEnvironment } = await import("@typescript/vfs");
    // Dynamically imported so the bundled lib.*.d.ts text lands in the lazy
    // script-editor chunk (loaded only when a script note opens), not the editor
    // core used by every code note.
    const { tsLibFiles } = await import("./ts_lib_files.js");

    // The TypeScript lib.*.d.ts files are bundled (see ./ts_lib_files) so the
    // language service works offline — no CDN fetch. Each editor gets its own
    // map so concurrent script notes (e.g. split view) don't clobber each
    // other's source file.
    const fsMap = new Map<string, string>(Object.entries(tsLibFiles));
    const path = scriptPath(mime);
    // Seed with a space, never an empty string: `@typescript/vfs` treats an
    // empty root file as "not found" (TS6053) at program creation. `tsSync`
    // likewise pushes `doc || ' '`, so the script file is never empty at runtime.
    fsMap.set(path, " ");

    const rootFiles = [path, API_GLOBALS_PATH];

    if (isFrontendMime(mime)) {
        // Frontend `api` types come from the shared, self-contained public surface
        // in @triliumnext/commons (single source of truth, drift-guarded against the
        // real implementation). Inject the module verbatim plus a bridge that exposes
        // it as the `api` global. Relative `?raw` (not a bare specifier) so it lands
        // in the lazy chunk and isn't gated by package `exports`.
        const apiTypes = (await import("../../../commons/src/lib/script_api.ts?raw")).default;
        fsMap.set(API_TYPES_PATH, apiTypes);
        fsMap.set(API_GLOBALS_PATH, `import type { FrontendApi } from "./trilium-script-api";\ndeclare global {\n    // eslint-disable-next-line no-var\n    var api: FrontendApi;\n}\n`);
        rootFiles.push(API_TYPES_PATH);

        // Frontend scripts run in the browser with jQuery available as `$` / `jQuery`;
        // backend scripts run server-side and have neither.
        const { jqueryGlobals } = await import("./jquery_types.js");
        fsMap.set(JQUERY_DTS_PATH, jqueryGlobals);
        rootFiles.push(JQUERY_DTS_PATH);
    } else {
        // Backend still uses the curated stub (migrating to the shared module next).
        fsMap.set(API_GLOBALS_PATH, backendApiDts);
    }

    if (mime === SCRIPT_MIME_JSX) {
        // JSX notes import Preact/the api via bare specifiers (`trilium:preact`,
        // `trilium:api`). Inject the real Preact .d.ts under `/node_modules/preact`
        // so those modules — and the `JSX.IntrinsicElements` namespace — resolve.
        const { preactVfsFiles, triliumModulesDts } = await import("./preact_types.js");
        for (const [filePath, content] of Object.entries(preactVfsFiles)) {
            fsMap.set(filePath, content);
        }
        fsMap.set(TRILIUM_MODULES_DTS_PATH, triliumModulesDts);
        rootFiles.push(TRILIUM_MODULES_DTS_PATH);
    }

    const compilerOptions = {
        ...COMPILER_OPTIONS,
        target: ts.ScriptTarget.ES2020,
        lib: ["es2020", "dom"],
        // The runtime uses the classic `h` transform, but we only type-check (never
        // emit), so the automatic runtime is cleaner: it pulls `JSX.IntrinsicElements`
        // from `preact/jsx-runtime`, giving real element/attribute typing without a
        // factory symbol in scope.
        ...(mime === SCRIPT_MIME_JSX
            ? { jsx: ts.JsxEmit.ReactJSX, jsxImportSource: "preact" }
            : {})
    };

    const system = createSystem(fsMap);
    return createVirtualTypeScriptEnvironment(system, rootFiles, ts, compilerOptions);
}

export interface TypeCompletion {
    /** Editor extensions wiring the TypeScript environment (sync, lint, hover). */
    extensions: Extension[];
    /** Autocompletion source for the editor's shared `autocompletion()`, or null. */
    source: CompletionSource | null;
}

/**
 * Wires the TypeScript language service into the editor for the given script
 * MIME type. The completion `source` is returned separately (rather than as its
 * own `autocompletion()` extension) so it can be merged with other sources —
 * e.g. snippet slash-commands — into the editor's single autocompletion.
 *
 * Returns empty extensions and a null source for non-script MIME types.
 */
export async function buildTypeCompletion(mime: string): Promise<TypeCompletion> {
    if (!isScriptMime(mime)) {
        return { extensions: [], source: null };
    }

    const env = await createEnv(mime);
    const { tsFacet, tsSync, tsAutocomplete, tsLinter, tsHover } = await import("@valtown/codemirror-ts");

    return {
        extensions: [
            tsFacet.of({ env, path: scriptPath(mime) }),
            tsSync(),
            tsLinter({ diagnosticCodesToIgnore: ignoredDiagnosticCodes(mime) }),
            tsHover()
        ],
        source: tsAutocomplete()
    };
}

/** TS1108: A 'return' statement can only be used within a function body. */
const TS_RETURN_OUTSIDE_FUNCTION = 1108;
/** TS1375: top-level 'await' is only allowed when the file is a module. */
const TS_TOP_LEVEL_AWAIT = 1375;

/**
 * Diagnostic codes suppressed for the given script MIME type. Trilium wraps every
 * script in a function before executing it (see the client's `bundle.ts` and the
 * server's `script.ts`), so grammar that's only valid inside a function body is
 * fine at runtime:
 *  - both wrappers are functions, so a top-level `return` is always valid;
 *  - only the frontend wrapper is `async`, so top-level `await` is valid in
 *    frontend scripts but genuinely invalid in backend ones.
 */
function ignoredDiagnosticCodes(mime: string): number[] {
    // JSX render notes are real modules (`import`/`export default`) transpiled by
    // `buildJsx`, not wrapped in a function — so the function-body grammar
    // exemptions below don't apply (top-level `return` is genuinely invalid, and
    // top-level `await` is allowed natively in a module).
    if (mime === SCRIPT_MIME_JSX) {
        return [];
    }
    const codes = [TS_RETURN_OUTSIDE_FUNCTION];
    if (mime === SCRIPT_MIME_FRONTEND) {
        codes.push(TS_TOP_LEVEL_AWAIT);
    }
    return codes;
}

/**
 * Returns the TypeScript diagnostic codes the script-note language service
 * surfaces for `code` under the given script MIME type, using the exact compiler
 * options and ignore list the editor uses. Mirrors `@valtown/codemirror-ts`'s
 * `getLints` (syntactic + semantic, minus the ignored codes), so tests reflect
 * what the user actually sees. Intended for tests asserting which diagnostics
 * are (and aren't) surfaced.
 */
export async function getScriptDiagnosticCodes(mime: string, code: string): Promise<number[]> {
    const env = await createEnv(mime);
    const path = scriptPath(mime);
    env.updateFile(path, code.length ? code : " ");
    const diagnostics = [
        ...env.languageService.getSyntacticDiagnostics(path),
        ...env.languageService.getSemanticDiagnostics(path)
    ];
    const ignored = ignoredDiagnosticCodes(mime);
    return diagnostics
        .map((d) => d.code)
        .filter((code) => !ignored.includes(code));
}
