import { describe, expect, it } from "vitest";

import { resolveResourcePath } from "./importer.js";

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
