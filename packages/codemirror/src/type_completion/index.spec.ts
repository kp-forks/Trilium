import { describe, expect, it } from "vitest";

import { getScriptDiagnosticCodes, SCRIPT_MIME_BACKEND, SCRIPT_MIME_FRONTEND } from "./index.js";

/** "Property 'x' does not exist on type 'y'." */
const TS_UNKNOWN_PROPERTY = 2339;
/** "'await' expressions are only allowed at the top level of a file when that file is a module…" */
const TS_TOP_LEVEL_AWAIT = 1375;
/** "Cannot find name '$'. Do you need to install type definitions for jQuery?…" */
const TS_JQUERY_NOT_FOUND = 2592;

// Loading TypeScript + the bundled lib.*.d.ts the first time is not instant.
const TIMEOUT = 30_000;

// Valid script snippets must produce *no* diagnostics at all — asserting the
// empty set (rather than just "not code N") also catches any unrelated spurious
// diagnostic from a config/lib/api-typing regression. The test name records the
// specific false positive each snippet guards against.
describe("script note diagnostics", () => {
    it("does not flag untyped parameters as implicit any (TS7006)", async () => {
        // Loose JS — untyped params are normal in script notes.
        const codes = await getScriptDiagnosticCodes(
            SCRIPT_MIME_FRONTEND,
            "function handleClick(event) { return event; }\nconst add = (a, b) => a + b;"
        );
        expect(codes).toEqual([]);
    }, TIMEOUT);

    it("does not flag untyped parameters in backend scripts either (TS7006)", async () => {
        const codes = await getScriptDiagnosticCodes(
            SCRIPT_MIME_BACKEND,
            "function process(note, depth) { return note; }"
        );
        expect(codes).toEqual([]);
    }, TIMEOUT);

    it("does not flag a top-level return — scripts run inside a function wrapper (TS1108)", async () => {
        const codes = await getScriptDiagnosticCodes(
            SCRIPT_MIME_FRONTEND,
            "if (!api.currentNote) { return; }\nreturn api.showMessage('done');"
        );
        expect(codes).toEqual([]);
    }, TIMEOUT);

    it("does not flag a top-level return in backend scripts either (TS1108)", async () => {
        const codes = await getScriptDiagnosticCodes(
            SCRIPT_MIME_BACKEND,
            "const note = api.getNote('root');\nif (!note) { return; }\nreturn note.title;"
        );
        expect(codes).toEqual([]);
    }, TIMEOUT);

    it("supports top-level await in frontend scripts — async wrapper (TS1375)", async () => {
        const codes = await getScriptDiagnosticCodes(
            SCRIPT_MIME_FRONTEND,
            "const value = await Promise.resolve(1);"
        );
        expect(codes).toEqual([]);
    }, TIMEOUT);

    it("flags top-level await in backend scripts — non-async wrapper (TS1375)", async () => {
        // The backend wrapper is a plain function, so top-level await is genuinely
        // invalid there and must stay flagged.
        const codes = await getScriptDiagnosticCodes(
            SCRIPT_MIME_BACKEND,
            "const value = await Promise.resolve(1);"
        );
        expect(codes).toContain(TS_TOP_LEVEL_AWAIT);
    }, TIMEOUT);

    it("provides jQuery types to frontend scripts ($ and JQuery methods)", async () => {
        const codes = await getScriptDiagnosticCodes(
            SCRIPT_MIME_FRONTEND,
            "const $widget = $('<div>'); $widget.addClass('active').on('click', () => {});"
        );
        expect(codes).toEqual([]);
    }, TIMEOUT);

    it("does not provide jQuery to backend scripts ($ is unavailable server-side)", async () => {
        const codes = await getScriptDiagnosticCodes(
            SCRIPT_MIME_BACKEND,
            "const el = $('<div>');"
        );
        expect(codes).toContain(TS_JQUERY_NOT_FOUND);
    }, TIMEOUT);

    it("still surfaces real errors (unknown api member)", async () => {
        // Guards against "fixing" false positives by disabling all checking:
        // genuine semantic errors must still be reported.
        const codes = await getScriptDiagnosticCodes(
            SCRIPT_MIME_FRONTEND,
            "api.thisMethodDoesNotExist();"
        );
        expect(codes).toContain(TS_UNKNOWN_PROPERTY);
    }, TIMEOUT);
});
