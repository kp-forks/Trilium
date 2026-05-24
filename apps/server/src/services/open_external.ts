import { SHELL_OPEN_EXTERNAL_PROTOCOLS } from "@triliumnext/commons";

/**
 * Validates a URL received from the renderer for the "open-external" IPC
 * channel. Returns the parsed URL on success; throws on any invariant
 * violation so a hostile or buggy caller surfaces loudly in the main-process
 * log rather than silently dispatching to an OS protocol handler.
 *
 * The handler this gates (electron.shell.openExternal) historically has been
 * a Follina-class RCE primitive on Windows (ms-msdt:, search-ms:, etc.) and a
 * credential-leak primitive (smb:, ldap:). Allowlisting the scheme is the
 * only reliable defence.
 */
export function validateOpenExternalUrl(input: unknown): URL {
    if (typeof input !== "string" || input.length === 0) {
        throw new Error("open-external: invalid URL");
    }

    let parsed: URL;
    try {
        parsed = new URL(input);
    } catch {
        throw new Error(`open-external: not a valid URL: ${input}`);
    }

    // URL.protocol returns "http:" — strip the trailing colon for comparison.
    const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
    if (!SHELL_OPEN_EXTERNAL_PROTOCOLS.includes(scheme)) {
        throw new Error(`open-external: blocked scheme '${scheme}'`);
    }

    return parsed;
}
