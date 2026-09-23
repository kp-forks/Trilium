import { describe, expect, it } from "vitest";

import { buildShareLinkHtml, getShareScope } from "./shared_info";

describe("buildShareLinkHtml", () => {
    it("keeps the whole link in the anchor's href and text, whatever characters it carries", () => {
        const link = `http://host/share/my alias"x`;
        const anchor = parseAnchor(buildShareLinkHtml(link));

        expect(anchor.getAttribute("href")).toBe(link);
        expect(anchor.textContent).toBe(link);
        expect(anchor.getAttributeNames().sort()).toEqual([ "class", "href" ]);
    });
});

describe("getShareScope", () => {
    it("tells a public share from a local one and from a standalone preview", () => {
        const syncServerHost = "https://sync.example.com";

        expect(getShareScope({ isElectron: false, isStandalone: false, syncServerHost: "" })).toBe("public");
        expect(getShareScope({ isElectron: true, isStandalone: false, syncServerHost: "" })).toBe("local");
        expect(getShareScope({ isElectron: true, isStandalone: false, syncServerHost })).toBe("public");
        expect(getShareScope({ isElectron: false, isStandalone: true, syncServerHost: "" })).toBe("preview");
        expect(getShareScope({ isElectron: false, isStandalone: true, syncServerHost })).toBe("public");
    });
});

function parseAnchor(html: string) {
    const container = document.createElement("div");
    container.innerHTML = html;

    const anchor = container.querySelector("a");
    if (!anchor) {
        throw new Error(`No anchor in ${html}`);
    }

    return anchor;
}
