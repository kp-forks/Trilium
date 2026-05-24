import { describe, expect, it } from "vitest";

import { validateOpenExternalUrl } from "./open_external.js";

describe("validateOpenExternalUrl", () => {
    it("rejects malformed input", () => {
        expect(() => validateOpenExternalUrl(undefined)).toThrow(/invalid URL/);
        expect(() => validateOpenExternalUrl(null)).toThrow(/invalid URL/);
        expect(() => validateOpenExternalUrl(123)).toThrow(/invalid URL/);
        expect(() => validateOpenExternalUrl("")).toThrow(/invalid URL/);
    });

    it("rejects strings that don't parse as URLs", () => {
        expect(() => validateOpenExternalUrl("not a url")).toThrow(/not a valid URL/);
        expect(() => validateOpenExternalUrl("example.com")).toThrow(/not a valid URL/);
        expect(() => validateOpenExternalUrl("/relative/path")).toThrow(/not a valid URL/);
    });

    it("rejects known-dangerous OS protocol-handler schemes", () => {
        // Follina (CVE-2022-30190) and friends
        expect(() => validateOpenExternalUrl("ms-msdt:/id PCWDiagnostic"))
            .toThrow(/blocked scheme 'ms-msdt'/);
        expect(() => validateOpenExternalUrl("search-ms:query=x&crumb=location:\\\\evil.example\\share"))
            .toThrow(/blocked scheme 'search-ms'/);
        expect(() => validateOpenExternalUrl("ms-officecmd:%7B%22LocalProviders%22:..."))
            .toThrow(/blocked scheme 'ms-officecmd'/);

        // Script execution
        expect(() => validateOpenExternalUrl("javascript:alert(1)"))
            .toThrow(/blocked scheme 'javascript'/);
        expect(() => validateOpenExternalUrl("vbscript:msgbox(1)"))
            .toThrow(/blocked scheme 'vbscript'/);
    });

    it("rejects schemes explicitly dropped from the openExternal allowlist", () => {
        // local-file launcher (must go through openFileUrl instead)
        expect(() => validateOpenExternalUrl("file:///C:/Windows/System32/calc.exe"))
            .toThrow(/blocked scheme 'file'/);
        // phishing surface
        expect(() => validateOpenExternalUrl("data:text/html,<script>alert(1)</script>"))
            .toThrow(/blocked scheme 'data'/);
        // NTLM credential theft / SMB relay
        expect(() => validateOpenExternalUrl("smb://attacker.example/share/file"))
            .toThrow(/blocked scheme 'smb'/);
        // NTLM relay / JNDI lookup
        expect(() => validateOpenExternalUrl("ldap://attacker.example/dc=x"))
            .toThrow(/blocked scheme 'ldap'/);
        expect(() => validateOpenExternalUrl("ldaps://attacker.example/dc=x"))
            .toThrow(/blocked scheme 'ldaps'/);
    });

    it("accepts standard web and communication schemes", () => {
        expect(validateOpenExternalUrl("https://example.com/path").toString())
            .toBe("https://example.com/path");
        expect(validateOpenExternalUrl("http://example.com/").toString())
            .toBe("http://example.com/");
        expect(validateOpenExternalUrl("mailto:user@example.com").toString())
            .toBe("mailto:user@example.com");
        expect(validateOpenExternalUrl("tel:+15551234").toString())
            .toBe("tel:+15551234");
    });

    it("accepts the note-app integration schemes (zotero/obsidian/etc.)", () => {
        expect(() => validateOpenExternalUrl("zotero://select/items/0_ABC")).not.toThrow();
        expect(() => validateOpenExternalUrl("obsidian://open?vault=Notes")).not.toThrow();
        expect(() => validateOpenExternalUrl("logseq://x-callback-url/foo")).not.toThrow();
        expect(() => validateOpenExternalUrl("evernote://x")).not.toThrow();
        expect(() => validateOpenExternalUrl("onenote://x")).not.toThrow();
    });

    it("matches the scheme case-insensitively", () => {
        // URL.protocol returns lowercase, so HTTPS:// becomes "https:".
        expect(() => validateOpenExternalUrl("HTTPS://example.com")).not.toThrow();
        expect(() => validateOpenExternalUrl("MS-MSDT:/id x"))
            .toThrow(/blocked scheme 'ms-msdt'/);
    });
});
