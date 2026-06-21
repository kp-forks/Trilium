import { describe, expect, it } from "vitest";

import { type LinkTarget, resolveResourcePath, rewriteLinks } from "./importer.js";

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
});
