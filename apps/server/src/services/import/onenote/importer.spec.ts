import { describe, expect, it } from "vitest";

import { resolveSubpageParents } from "./importer.js";

describe("resolveSubpageParents", () => {
    it("keeps top-level pages directly under the section", () => {
        // No indentation: every page is a root (parent index -1).
        expect(resolveSubpageParents([0, 0, 0])).toEqual([-1, -1, -1]);
        expect(resolveSubpageParents([])).toEqual([]);
    });

    it("nests subpages and sub-subpages under the nearest shallower page", () => {
        // Two subpages share the first page as parent.
        expect(resolveSubpageParents([0, 1, 1])).toEqual([-1, 0, 0]);
        // A sub-subpage chains under its subpage.
        expect(resolveSubpageParents([0, 1, 2])).toEqual([-1, 0, 1]);
    });

    it("re-parents siblings correctly when stepping back out of nesting", () => {
        // 0:root, 1→0, 2→1, then back to level 1 (→0) and a new root.
        expect(resolveSubpageParents([0, 1, 2, 1, 0])).toEqual([-1, 0, 1, 0, -1]);
        // Each top-level page owns its own subpage.
        expect(resolveSubpageParents([0, 1, 0, 1])).toEqual([-1, 0, -1, 2]);
    });

    it("falls back to the section root for malformed indentation", () => {
        // Leading subpage with no parent, and a level jump that skips level 1.
        expect(resolveSubpageParents([1, 0])).toEqual([-1, -1]);
        expect(resolveSubpageParents([0, 2])).toEqual([-1, -1]);
    });
});
