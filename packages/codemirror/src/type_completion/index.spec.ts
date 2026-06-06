import { describe, expect, it } from "vitest";

import { getScriptDiagnosticCodes, SCRIPT_MIME_BACKEND, SCRIPT_MIME_FRONTEND } from "./index.js";

/** "Parameter 'x' implicitly has an 'any' type." */
const TS_IMPLICIT_ANY = 7006;
/** "Property 'x' does not exist on type 'y'." */
const TS_UNKNOWN_PROPERTY = 2339;
/** "A 'return' statement can only be used within a function body." */
const TS_RETURN_OUTSIDE_FUNCTION = 1108;

// Loading TypeScript + the bundled lib.*.d.ts the first time is not instant.
const TIMEOUT = 30_000;

describe("script note diagnostics", () => {
    it("does not flag untyped parameters as implicit any", async () => {
        // Loose JS — untyped params are normal in script notes and must not warn.
        const codes = await getScriptDiagnosticCodes(
            SCRIPT_MIME_FRONTEND,
            "function handleClick(event) { return event; }\nconst add = (a, b) => a + b;"
        );
        expect(codes).not.toContain(TS_IMPLICIT_ANY);
    }, TIMEOUT);

    it("does not flag untyped parameters in backend scripts either", async () => {
        const codes = await getScriptDiagnosticCodes(
            SCRIPT_MIME_BACKEND,
            "function process(note, depth) { return note; }"
        );
        expect(codes).not.toContain(TS_IMPLICIT_ANY);
    }, TIMEOUT);

    it("does not flag a top-level return (scripts run inside a function wrapper)", async () => {
        // Trilium wraps scripts in a function before executing them, so a
        // top-level `return` is valid at runtime and must not be flagged.
        const codes = await getScriptDiagnosticCodes(
            SCRIPT_MIME_FRONTEND,
            "if (!api.currentNote) { return; }\nreturn api.showMessage('done');"
        );
        expect(codes).not.toContain(TS_RETURN_OUTSIDE_FUNCTION);
    }, TIMEOUT);

    it("does not flag a top-level return in backend scripts either", async () => {
        const codes = await getScriptDiagnosticCodes(
            SCRIPT_MIME_BACKEND,
            "const note = api.getNote('root');\nif (!note) { return; }\nreturn note.title;"
        );
        expect(codes).not.toContain(TS_RETURN_OUTSIDE_FUNCTION);
    }, TIMEOUT);

    it("still surfaces real errors (unknown api member)", async () => {
        // Guards against "fixing" implicit-any by disabling all checking: genuine
        // semantic errors must still be reported.
        const codes = await getScriptDiagnosticCodes(
            SCRIPT_MIME_FRONTEND,
            "api.thisMethodDoesNotExist();"
        );
        expect(codes).toContain(TS_UNKNOWN_PROPERTY);
    }, TIMEOUT);
});
