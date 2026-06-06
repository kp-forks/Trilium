import type { CompletionSource } from "@codemirror/autocomplete";
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
            tsFacet.of({ env, path: SCRIPT_PATH }),
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
    env.updateFile(SCRIPT_PATH, code.length ? code : " ");
    const diagnostics = [
        ...env.languageService.getSyntacticDiagnostics(SCRIPT_PATH),
        ...env.languageService.getSemanticDiagnostics(SCRIPT_PATH)
    ];
    const ignored = ignoredDiagnosticCodes(mime);
    return diagnostics
        .map((d) => d.code)
        .filter((code) => !ignored.includes(code));
}
