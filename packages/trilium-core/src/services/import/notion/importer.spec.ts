import { describe, expect, it } from "vitest";

import { rewriteCollectionIncludes, rewriteLinks } from "./importer.js";
import type { LinkTarget } from "./model.js";

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

    it("leaves an anchor without an href untouched", () => {
        const input = `<p><a>plain</a></p>`;
        expect(rewriteLinks(input, resolveSubpage)).toBe(input);
    });

    it("does not throw on a malformed percent-encoded href", () => {
        const input = `<p><a href="%E0%A4%A.html">broken</a></p>`;
        expect(() => rewriteLinks(input, resolveSubpage)).not.toThrow();
        // Malformed encoding can't carry a resolvable id, so the link is left as-is.
        expect(rewriteLinks(input, resolveSubpage)).toBe(input);
    });
});

describe("rewriteCollectionIncludes", () => {
    const dbId = "38ac5eca1b8b808babeaf10c0980fa5b";
    const resolveDatabase = (notionId: string): LinkTarget | null =>
        notionId === dbId ? { noteId: "dbNote123", title: "Database title" } : null;

    // The full-export inline-database shape: a div linking to the separately-exported CSV.
    const block = (id: string) =>
        `<div class="collection-content"><h4 class="collection-title">Database title</h4>` +
        `<a href="Inline%20database%20test/Database%20title%20${id}.csv"><code>x</code></a></div>`;

    it("replaces an inline-database CSV reference with an include-note for the imported collection", () => {
        const input = `<p>Before</p>${block(dbId)}<p>After</p>`;
        expect(rewriteCollectionIncludes(input, resolveDatabase)).toBe(
            `<p>Before</p><section class="include-note" data-note-id="dbNote123" data-box-size="medium">&nbsp;</section><p>After</p>`
        );
    });

    it("leaves the block untouched when the referenced database wasn't imported", () => {
        const input = block("ffffffffffffffffffffffffffffffff");
        expect(rewriteCollectionIncludes(input, resolveDatabase)).toBe(input);
    });

    it("ignores a rendered collection table (the partial-export shape)", () => {
        // A partial export inlines the actual rows as a <table>, which has no CSV to resolve and is kept.
        const table = `<table class="collection-content"><tbody><tr><td>Foo</td></tr></tbody></table>`;
        expect(rewriteCollectionIncludes(table, resolveDatabase)).toBe(table);
    });
});
