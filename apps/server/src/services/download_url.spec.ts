import { describe, expect, it } from "vitest";

import { validateDownloadUrl } from "./download_url.js";

// Trilium's desktop renderer is served via a custom protocol whose origin is
// opaque per the WHATWG URL spec; this is the realistic page URL in production.
const DESKTOP_PAGE_URL = "trilium-app://app/";
// The web variant uses a plain HTTP origin.
const HTTP_PAGE_URL = "http://localhost:8080/index.html";

describe("validateDownloadUrl", () => {
    it("rejects malformed input", () => {
        expect(() => validateDownloadUrl(undefined, DESKTOP_PAGE_URL)).toThrow(/invalid URL/);
        expect(() => validateDownloadUrl(null, DESKTOP_PAGE_URL)).toThrow(/invalid URL/);
        expect(() => validateDownloadUrl(123, DESKTOP_PAGE_URL)).toThrow(/invalid URL/);
        expect(() => validateDownloadUrl("", DESKTOP_PAGE_URL)).toThrow(/invalid URL/);
    });

    it("rejects strings that don't parse as URLs", () => {
        expect(() => validateDownloadUrl("not a url", DESKTOP_PAGE_URL)).toThrow(/not a valid URL/);
        expect(() => validateDownloadUrl("example.com", DESKTOP_PAGE_URL)).toThrow(/not a valid URL/);
        expect(() => validateDownloadUrl("/relative/path", DESKTOP_PAGE_URL))
            .toThrow(/not a valid URL/);
    });

    it("rejects cross-origin downloads (HTTP renderer)", () => {
        // Different host
        expect(() => validateDownloadUrl("https://attacker.example/malware.exe", HTTP_PAGE_URL))
            .toThrow(/cross-origin download blocked/);
        // Same host, different port
        expect(() => validateDownloadUrl("http://localhost:9090/foo", HTTP_PAGE_URL))
            .toThrow(/cross-origin download blocked/);
        // Same host, different scheme
        expect(() => validateDownloadUrl("https://localhost:8080/foo", HTTP_PAGE_URL))
            .toThrow(/cross-origin download blocked/);
    });

    it("rejects cross-origin downloads (custom-protocol renderer)", () => {
        // Different scheme — common XSS attempt
        expect(() => validateDownloadUrl("https://attacker.example/malware.exe", DESKTOP_PAGE_URL))
            .toThrow(/cross-origin download blocked/);
        // Same scheme, different host
        expect(() => validateDownloadUrl("trilium-app://attacker/x", DESKTOP_PAGE_URL))
            .toThrow(/cross-origin download blocked/);
    });

    it("rejects URLs without a usable host on either side", () => {
        // data:, file:///, about:, blob: all parse but have empty hostname.
        // We refuse them because two such URLs would naively compare as
        // same-origin (both have hostname === "") even when they shouldn't.
        expect(() => validateDownloadUrl("data:text/plain,hello", DESKTOP_PAGE_URL))
            .toThrow(/hostless URL not allowed/);
        expect(() => validateDownloadUrl("file:///C:/Windows/System32/calc.exe", DESKTOP_PAGE_URL))
            .toThrow(/hostless URL not allowed/);
        expect(() => validateDownloadUrl("about:blank", DESKTOP_PAGE_URL))
            .toThrow(/not a valid URL|hostless URL not allowed/);
        // Same shape, but the allowed origin (the renderer itself) is hostless
        expect(() => validateDownloadUrl("file:///C:/foo", "file:///C:/index.html"))
            .toThrow(/hostless URL not allowed/);
    });

    it("rejects when the allowed origin itself is malformed", () => {
        expect(() => validateDownloadUrl(`${HTTP_PAGE_URL}`, "not a url"))
            .toThrow(/invalid allowed origin/);
        expect(() => validateDownloadUrl(`${HTTP_PAGE_URL}`, ""))
            .toThrow(/invalid allowed origin/);
    });

    it("accepts same-origin downloads via the trilium-app:// custom protocol", () => {
        // The real production scenario. getUrlForDownload() in open.ts builds
        // URLs of this shape from window.location.
        expect(validateDownloadUrl("trilium-app://app/api/notes/abc/download", DESKTOP_PAGE_URL).toString())
            .toBe("trilium-app://app/api/notes/abc/download");
        expect(validateDownloadUrl("trilium-app://app/api/attachments/xyz/download?123", DESKTOP_PAGE_URL).toString())
            .toBe("trilium-app://app/api/attachments/xyz/download?123");
        expect(validateDownloadUrl("trilium-app://app/api/revisions/r1/download", DESKTOP_PAGE_URL).toString())
            .toBe("trilium-app://app/api/revisions/r1/download");
        expect(validateDownloadUrl("trilium-app://app/api/branches/b1/export/subtree/html/1/t1", DESKTOP_PAGE_URL).toString())
            .toBe("trilium-app://app/api/branches/b1/export/subtree/html/1/t1");
    });

    it("accepts same-origin downloads via plain HTTP", () => {
        // Equivalent to the web variant or to alternate Electron configurations.
        expect(validateDownloadUrl("http://localhost:8080/api/notes/abc/download", HTTP_PAGE_URL).toString())
            .toBe("http://localhost:8080/api/notes/abc/download");
    });
});
