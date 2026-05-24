import path from "path";
import { describe, expect, it } from "vitest";

import { validateOpenFileUrl } from "./open_file_url.js";

describe("validateOpenFileUrl", () => {
    it("rejects malformed input", () => {
        expect(() => validateOpenFileUrl(undefined)).toThrow(/invalid URL/);
        expect(() => validateOpenFileUrl(null)).toThrow(/invalid URL/);
        expect(() => validateOpenFileUrl(123)).toThrow(/invalid URL/);
        expect(() => validateOpenFileUrl("")).toThrow(/invalid URL/);
    });

    it("rejects strings that don't parse as URLs", () => {
        expect(() => validateOpenFileUrl("not a url")).toThrow(/not a valid URL/);
        expect(() => validateOpenFileUrl("/some/path")).toThrow(/not a valid URL/);
    });

    it("rejects non-file: schemes", () => {
        expect(() => validateOpenFileUrl("https://example.com/foo")).toThrow(/not a file: URL/);
        expect(() => validateOpenFileUrl("smb://attacker.example/share/x"))
            .toThrow(/not a file: URL/);
    });

    it("rejects UNC paths (the NTLM-credential-theft vector)", () => {
        // Classic UNC: file: URL with a non-empty hostname resolves to
        // \\host\share\x on Windows, triggering SMB auth and leaking NTLM hash.
        expect(() => validateOpenFileUrl("file://attacker.example/share/x"))
            .toThrow(/UNC path blocked: attacker\.example/);
        expect(() => validateOpenFileUrl("file://192.168.1.1/c$/Windows"))
            .toThrow(/UNC path blocked: 192\.168\.1\.1/);
    });

    it.runIf(process.platform === "win32")(
        "accepts and resolves normal Windows file: URLs",
        () => {
            expect(validateOpenFileUrl("file:///C:/Windows/notepad.exe"))
                .toBe(path.win32.normalize("C:\\Windows\\notepad.exe"));
            // Malformed form some sources emit: file://C:/path (drive letter as host).
            // The validator normalises this before the empty-host check.
            expect(validateOpenFileUrl("file://C:/Windows/notepad.exe"))
                .toBe(path.win32.normalize("C:\\Windows\\notepad.exe"));
        }
    );

    it.runIf(process.platform !== "win32")(
        "accepts and resolves normal POSIX file: URLs",
        () => {
            expect(validateOpenFileUrl("file:///etc/hosts")).toBe("/etc/hosts");
            expect(validateOpenFileUrl("file:///tmp/foo bar"))
                .toBe("/tmp/foo bar");
        }
    );
});
