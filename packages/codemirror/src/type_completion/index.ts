import { autocompletion } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";

import backendApiDts from "./backend_api.js";
import frontendApiDts from "./frontend_api.js";

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

export function isScriptMime(mime: string): boolean {
    return mime === SCRIPT_MIME_FRONTEND || mime === SCRIPT_MIME_BACKEND;
}

const SCRIPT_PATH = "/script.js";
const API_DTS_PATH = "/trilium-api.d.ts";

const COMPILER_OPTIONS = {
    // `target`/`lib` are filled in lazily once TypeScript is loaded (needs the ts enums).
    allowJs: true,
    checkJs: true,
    // `@typescript/vfs` defaults moduleResolution to the legacy `node10`, which
    // TypeScript 6 rejects unless deprecations are explicitly silenced.
    ignoreDeprecations: "6.0"
};

// The default TypeScript lib.*.d.ts map is large and identical for every
// editor, so fetch it once per session and share it (cloned) across envs.
let libMapPromise: Promise<Map<string, string>> | null = null;

async function getLibMap(ts: typeof import("typescript")) {
    const { createDefaultMapFromCDN } = await import("@typescript/vfs");
    const compilerOptions = {
        ...COMPILER_OPTIONS,
        target: ts.ScriptTarget.ES2020,
        lib: ["es2020", "dom"]
    };
    // cache=false: we keep the map in module memory instead of localStorage
    // (Trilium avoids localStorage; in-memory sharing is enough per session).
    return createDefaultMapFromCDN(compilerOptions, ts.version, false, ts);
}

async function createEnv(mime: string) {
    const tsModule = await import("typescript");
    const ts = tsModule.default ?? tsModule;
    const { createSystem, createVirtualTypeScriptEnvironment } = await import("@typescript/vfs");

    if (!libMapPromise) {
        libMapPromise = getLibMap(ts);
    }
    const libMap = await libMapPromise;

    // Each editor gets its own copy so concurrent script notes (e.g. split
    // view) don't clobber each other's source file.
    const fsMap = new Map(libMap);
    fsMap.set(API_DTS_PATH, mime === SCRIPT_MIME_BACKEND ? backendApiDts : frontendApiDts);
    // Seed with a space, never an empty string: `@typescript/vfs` treats an
    // empty root file as "not found" (TS6053) at program creation. `tsSync`
    // likewise pushes `doc || ' '`, so the script file is never empty at runtime.
    fsMap.set(SCRIPT_PATH, " ");

    const compilerOptions = {
        ...COMPILER_OPTIONS,
        target: ts.ScriptTarget.ES2020,
        lib: ["es2020", "dom"]
    };

    const system = createSystem(fsMap);
    return createVirtualTypeScriptEnvironment(
        system,
        [SCRIPT_PATH, API_DTS_PATH],
        ts,
        compilerOptions
    );
}

/**
 * Builds the set of CodeMirror extensions that wire the TypeScript language
 * service into the editor for the given script MIME type. Returns an empty
 * array (no completion) for non-script MIME types.
 */
export async function buildTypeCompletion(mime: string): Promise<Extension[]> {
    if (!isScriptMime(mime)) {
        return [];
    }

    const env = await createEnv(mime);
    const { tsFacet, tsSync, tsAutocomplete, tsLinter, tsHover } = await import("@valtown/codemirror-ts");

    return [
        tsFacet.of({ env, path: SCRIPT_PATH }),
        tsSync(),
        tsLinter(),
        autocompletion({ override: [tsAutocomplete()] }),
        tsHover()
    ];
}
