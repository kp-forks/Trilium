/**
 * Validates a URL received from the renderer for the "download-url" IPC
 * channel. Returns the parsed URL on success; throws on any invariant
 * violation so a hostile or buggy caller surfaces loudly in the main-process
 * log rather than silently triggering a download.
 *
 * The handler this gates (event.sender.downloadURL) writes a file straight
 * to the user's Downloads folder with no save dialog. An unconstrained
 * channel lets a compromised renderer (e.g. via XSS) pre-position malware
 * disguised as a legitimate download for later execution. Locking it to the
 * renderer's own origin closes the cross-origin abuse path while preserving
 * the legitimate same-origin attachment / revision / export downloads.
 */
export function validateDownloadUrl(input: unknown, allowedOrigin: string): URL {
    if (typeof input !== "string" || input.length === 0) {
        throw new Error("download-url: invalid URL");
    }

    let parsed: URL;
    try {
        parsed = new URL(input);
    } catch {
        throw new Error(`download-url: not a valid URL: ${input}`);
    }

    let allowed: URL;
    try {
        allowed = new URL(allowedOrigin);
    } catch {
        throw new Error(`download-url: invalid allowed origin: ${allowedOrigin}`);
    }

    // We can't use URL.origin for the comparison because Electron serves the
    // renderer via a custom protocol (trilium-app://app/) which the WHATWG URL
    // spec treats as opaque-origin (.origin === "null"). Two opaque-origin URLs
    // would always string-compare as equal even across different schemes/hosts.
    //
    // Instead, require both sides to have a non-empty hostname (rules out
    // data:, file:///, about:, blob:) and compare scheme + hostname + port
    // component-by-component.
    if (allowed.hostname === "" || parsed.hostname === "") {
        throw new Error("download-url: hostless URL not allowed");
    }

    const sameOrigin = parsed.protocol === allowed.protocol
        && parsed.hostname === allowed.hostname
        && parsed.port === allowed.port;
    if (!sameOrigin) {
        throw new Error(
            `download-url: cross-origin download blocked: ${parsed.protocol}//${parsed.host} (allowed: ${allowed.protocol}//${allowed.host})`
        );
    }

    return parsed;
}
