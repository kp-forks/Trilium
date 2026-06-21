import { parse } from "node-html-parser";
import { describe, expect, it } from "vitest";

import { firstChildNotionId, type LinkTarget, ownedFolderKey, parentFolderKey, resolveResourcePath, rewriteLinks } from "./importer.js";

describe("resolveResourcePath", () => {
    it("resolves an image path relative to the page's directory in the zip", () => {
        expect(resolveResourcePath("Export/Page abc.html", "Page%20folder/img.png"))
            .toBe("Export/Page folder/img.png");
    });

    it("handles a page at the zip root", () => {
        expect(resolveResourcePath("Page abc.html", "sub/img.png")).toBe("sub/img.png");
    });

    it("decodes percent-encoding and resolves . and .. segments", () => {
        expect(resolveResourcePath("a/b/Page.html", "../c/img%20with%20space.png"))
            .toBe("a/c/img with space.png");
    });
});

describe("rewriteLinks", () => {
    const resolveSubpage = (notionId: string): LinkTarget | null =>
        notionId === "386c5eca1b8b802a90d8d891c7e62cd5" ? { noteId: "noteABC", title: "Subpage" } : null;

    it("turns an internal page link whose text is the page title into a reference link", () => {
        const input = `<p><a href="Formatting%20test/Subpage%20386c5eca1b8b802a90d8d891c7e62cd5.html">Subpage</a></p>`;
        expect(rewriteLinks(input, resolveSubpage)).toBe(
            `<p><a href="#root/noteABC" class="reference-link">Subpage</a></p>`
        );
    });

    it("keeps a plain internal link (preserving custom text) when the text isn't the title", () => {
        const input = `<p>See <a href="Subpage%20386c5eca1b8b802a90d8d891c7e62cd5.html">this page</a>.</p>`;
        expect(rewriteLinks(input, resolveSubpage)).toBe(
            `<p>See <a href="#root/noteABC">this page</a>.</p>`
        );
    });

    it("leaves external links and unresolved internal links untouched", () => {
        const external = `<p><a href="https://triliumnotes.org/">Trilium</a></p>`;
        expect(rewriteLinks(external, resolveSubpage)).toBe(external);

        const unknown = `<p><a href="Other%20ffffffffffffffffffffffffffffffff.html">Other</a></p>`;
        expect(rewriteLinks(unknown, resolveSubpage)).toBe(unknown);
    });

    it("ignores a 32-hex id that appears only in the query/hash, not the page path", () => {
        // The path ('Page.html') carries no id; the id only appears in a query parameter.
        const input = `<p><a href="Page.html?ref=386c5eca1b8b802a90d8d891c7e62cd5">x</a></p>`;
        expect(rewriteLinks(input, resolveSubpage)).toBe(input);
    });
});

describe("folder-based parenting keys", () => {
    // Notion names a page's children folder by title only (no id), while the page file keeps its id.
    const wrapper = "Export-21e2de27-9565-4851-8e2b-604e20bd0418";

    it("matches a child's containing folder to the parent page that owns it (title-only folder)", () => {
        const parent = `${wrapper}/45 cff419ddfc69457aad14bd0381cf0172.html`;
        const child = `${wrapper}/45/Brown fox 4731219279d04d78aca408c0a60c4263.html`;
        expect(ownedFolderKey(parent)).toBe("Export/45");
        expect(parentFolderKey(child)).toBe(ownedFolderKey(parent));
    });

    it("also matches when the folder itself carries an id", () => {
        const parent = `Parent ${"a".repeat(32)}.html`;
        const child = `Parent ${"a".repeat(32)}/Child ${"b".repeat(32)}.html`;
        expect(parentFolderKey(child)).toBe(ownedFolderKey(parent));
    });

    it("leaves a top-level page with no owning folder", () => {
        expect(parentFolderKey("45 cff419ddfc69457aad14bd0381cf0172.html")).toBe("");
    });
});

describe("firstChildNotionId", () => {
    const bodyOf = (inner: string) => parse(`<body>${inner}</body>`).querySelector("body");

    it("returns the id of body's direct page-wrapper child", () => {
        expect(firstChildNotionId(bodyOf(`<div id="386c5eca1b8b80439520cad27a0d2749" class="page"><p>x</p></div>`)))
            .toBe("386c5eca1b8b80439520cad27a0d2749");
    });

    it("does not pick up a 32-hex id on a nested (non-direct) element", () => {
        expect(firstChildNotionId(bodyOf(`<div class="page"><p id="386c5eca1b8b80439520cad27a0d2749">x</p></div>`)))
            .toBeUndefined();
    });
});
