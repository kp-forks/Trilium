import { parse } from "node-html-parser";
import { describe, expect, it } from "vitest";

import converter from "./converter.js";
import { extractPageId, rewritePageLinks } from "./links.js";

// Real OneNote source (debug-captured): the "First page" links to "Second page" with an internal
// `onenote:` link (carrying page-id) immediately followed by an external "Web view" https link.
const FIRST_PAGE_SOURCE = `<html lang="en-US">
    <body data-absolute-enabled="true" style="font-family:Calibri;font-size:11pt">
        <div style="position:absolute;left:48px;top:115px;width:624px">
            <p style="margin-top:0pt;margin-bottom:0pt">Go to <a href="onenote:#Second%20page&amp;section-id={4d9d9af6-7f91-4f16-956a-8bf2c330f6ab}&amp;page-id={eb2c4f67-8d3f-4fdb-a93b-32d6b3ba780d}&amp;end">Second page</a> (<a href="https://onedrive.live.com/personal/9b3de8eeb5fefd37/_layouts/15/Doc.aspx?sourcedoc=%7Bb9c20b8c%7D&amp;wd=target%28Link%20test.one%7C4d9d9af6%2FSecond%20page%7Ceb2c4f67-8d3f-4fdb-a93b-32d6b3ba780d%2F%29">Web view</a>)</p>
        </div>
    </body>
</html>`;

// The same page-id GUID appears in the page's own client URL (the bridge the importer uses to map a
// page-id to a Graph page) and in a link targeting it.
const SECOND_PAGE_GUID = "eb2c4f67-8d3f-4fdb-a93b-32d6b3ba780d";
const SECOND_PAGE_CLIENT_URL = `onenote:https://d.docs.live.net/abc/Documents/Link%20test/Link%20test.one#Second%20page&section-id={4d9d9af6-7f91-4f16-956a-8bf2c330f6ab}&page-id={${SECOND_PAGE_GUID.toUpperCase()}}&end`;

describe("extractPageId", () => {
    it("pulls the lowercased page-id GUID from an internal link and from a client URL", () => {
        expect(extractPageId(`onenote:#Second%20page&page-id={${SECOND_PAGE_GUID}}&end`)).toBe(SECOND_PAGE_GUID);
        // A client URL carrying the GUID upper-cased is normalized to lowercase.
        expect(extractPageId(SECOND_PAGE_CLIENT_URL)).toBe(SECOND_PAGE_GUID);
    });

    it("returns null when there is no page-id (web-view URL, external link, empty input)", () => {
        // The "Web view" onedrive URL embeds the GUID inside wd=target(...), not as a page-id= param.
        expect(extractPageId("https://onedrive.live.com/...wd=target%28Link.one%7Csec%2FSecond%7Ceb2c4f67-8d3f-4fdb-a93b-32d6b3ba780d%2F%29")).toBeNull();
        expect(extractPageId("https://example.com")).toBeNull();
        expect(extractPageId(null)).toBeNull();
        expect(extractPageId(undefined)).toBeNull();
    });
});

describe("rewritePageLinks", () => {
    const linkHtml = (href: string, text: string) => `<p><a href="${href}">${text}</a></p>`;

    it("rewrites an internal link whose target was imported into a Trilium note link, keeping the text", () => {
        const html = linkHtml(`onenote:#Second%20page&page-id={${SECOND_PAGE_GUID}}&end`, "Second page");
        const out = rewritePageLinks(html, (pageId) => (pageId === SECOND_PAGE_GUID ? "noteABC123" : null));

        const anchor = parse(out).querySelector("a");
        expect(anchor?.getAttribute("href")).toBe("#root/noteABC123");
        expect(anchor?.textContent).toBe("Second page");
    });

    it("leaves a link untouched when its target was not imported", () => {
        const html = linkHtml(`onenote:#Other&page-id={${SECOND_PAGE_GUID}}&end`, "Other");
        // resolve always returns null -> nothing changes, and the input is returned verbatim.
        expect(rewritePageLinks(html, () => null)).toBe(html);
    });

    it("never touches non-onenote links (external / web-view) or link-free content", () => {
        const webView = linkHtml("https://onedrive.live.com/...", "Web view");
        expect(rewritePageLinks(webView, () => "noteABC123")).toBe(webView);
        expect(rewritePageLinks("<p>no links here</p>", () => "noteABC123")).toBe("<p>no links here</p>");
    });

    it("resolves each link independently in mixed content", () => {
        const html =
            linkHtml(`onenote:#A&page-id={11111111-1111-1111-1111-111111111111}&end`, "A") +
            linkHtml(`onenote:#B&page-id={22222222-2222-2222-2222-222222222222}&end`, "B") +
            linkHtml("https://example.com", "external");
        const out = rewritePageLinks(html, (pageId) => (pageId.startsWith("11111111") ? "noteA" : null));

        const hrefs = parse(out).querySelectorAll("a").map((a) => a.getAttribute("href"));
        expect(hrefs).toEqual(["#root/noteA", "onenote:#B&page-id={22222222-2222-2222-2222-222222222222}&end", "https://example.com"]);
    });
});

// Guards the load-bearing assumption that the sanitizer keeps the `onenote:` href (the scheme is in
// ALLOWED_PROTOCOLS): the importer rewrites links on the *converted* HTML, so if conversion dropped
// the href, cross-page links would silently never resolve.
describe("convertPageHtml + rewritePageLinks (end to end)", () => {
    it("preserves the onenote link through conversion so it can be resolved afterwards", () => {
        const converted = converter.convertPageHtml(FIRST_PAGE_SOURCE);
        expect(extractPageId(parse(converted).querySelector("a")?.getAttribute("href"))).toBe(SECOND_PAGE_GUID);

        const out = rewritePageLinks(converted, (pageId) => (pageId === SECOND_PAGE_GUID ? "noteABC123" : null));
        const anchors = parse(out).querySelectorAll("a");
        expect(anchors[0]?.getAttribute("href")).toBe("#root/noteABC123"); // internal link resolved
        expect(anchors[1]?.getAttribute("href")).toContain("onedrive.live.com"); // web-view link untouched
    });
});
