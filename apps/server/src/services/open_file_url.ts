import url from "url";

/**
 * Validates a URL received from the renderer for the "open-file-url" IPC
 * channel and returns the resolved filesystem path. Throws on any invariant
 * violation so a hostile caller surfaces loudly in the main-process log.
 *
 * The specific threat blocked here is UNC paths: a file: URL with a non-empty
 * hostname (file://attacker.example/share/x) resolves on Windows to
 * \\attacker.example\share\x, which triggers SMB authentication and leaks the
 * logged-in user's NTLM hash to the attacker — the same primitive blocked for
 * smb:// URLs in the openExternal allowlist.
 */
export function validateOpenFileUrl(input: unknown): string {
    if (typeof input !== "string" || input.length === 0) {
        throw new Error("open-file-url: invalid URL");
    }

    // Some sources produce malformed file URLs that look like file://C:/path
    // (drive letter parsed as the host). Insert the missing slash so the URL
    // parser sees file:///C:/path with an empty host.
    const normalized = input.replace(/^file:\/\/(?=[a-zA-Z]:)/i, "file:///");

    let parsed: URL;
    try {
        parsed = new URL(normalized);
    } catch {
        throw new Error(`open-file-url: not a valid URL: ${input}`);
    }

    if (parsed.protocol !== "file:") {
        throw new Error(`open-file-url: not a file: URL: ${input}`);
    }

    if (parsed.hostname !== "") {
        throw new Error(`open-file-url: UNC path blocked: ${parsed.hostname}`);
    }

    return url.fileURLToPath(parsed);
}
