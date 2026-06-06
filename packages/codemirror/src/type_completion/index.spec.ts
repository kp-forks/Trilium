import { describe, expect, it } from "vitest";

import { getScriptDiagnosticCodes, SCRIPT_MIME_BACKEND, SCRIPT_MIME_FRONTEND } from "./index.js";

/** "Parameter 'x' implicitly has an 'any' type." */
const TS_IMPLICIT_ANY = 7006;
/** "Property 'x' does not exist on type 'y'." */
const TS_UNKNOWN_PROPERTY = 2339;

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
