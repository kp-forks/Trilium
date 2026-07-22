import { becca, cls } from "@triliumnext/core";
import { beforeAll, describe, expect, it, vi } from "vitest";

import sqlInit from "../../sql_init.js";
import graph from "./graph.js";
import { importSelection, mapWithConcurrency, resolveSubpageParents } from "./importer.js";

vi.mock("./graph.js", () => ({
    default: {
        getAccount: vi.fn(),
        listNotebooks: vi.fn(),
        listPages: vi.fn(),
        getPageContent: vi.fn(),
        getResource: vi.fn()
    }
}));

const graphMock = vi.mocked(graph);

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

describe("mapWithConcurrency", () => {
    it("returns results in input order regardless of completion order", async () => {
        // Later items resolve sooner, so order can only be preserved by index, not completion.
        const out = await mapWithConcurrency([30, 20, 10], 3, (ms) => new Promise<number>((resolve) => setTimeout(() => resolve(ms), ms)));
        expect(out).toEqual([30, 20, 10]);
    });

    it("never runs more than `limit` workers at once", async () => {
        let inFlight = 0;
        let peak = 0;
        const work = async () => {
            inFlight++;
            peak = Math.max(peak, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 5));
            inFlight--;
            return null;
        };

        await mapWithConcurrency(Array.from({ length: 20 }), 4, work);
        expect(peak).toBeLessThanOrEqual(4);
    });

    it("handles an empty list", async () => {
        expect(await mapWithConcurrency([], 4, async (x) => x)).toEqual([]);
    });
});

describe("importSelection (real DB)", () => {
    beforeAll(async () => {
        sqlInit.initializeDb();
        await sqlInit.dbReady;
    });

    it("labels every imported page note with its Graph page id", async () => {
        graphMock.listPages.mockResolvedValue([
            { id: "1-abc", title: "Page One", level: 0 },
            { id: "1-def", title: "Page Two", level: 1 }
        ]);
        graphMock.getPageContent.mockResolvedValue({ html: "<p>hello</p>", inkml: "" });

        await cls.init(() => importSelection({
            accessToken: "token",
            parentNoteId: "root",
            sections: [{ id: "sec-1", title: "Section", groupPath: [], notebookId: "nb-1", notebookTitle: "Notebook" }],
            taskId: "task-page-id-label"
        }));

        const pageOne = Object.values(becca.notes).find((note) => note.title === "Page One");
        const pageTwo = Object.values(becca.notes).find((note) => note.title === "Page Two");
        // The Graph page id enables a future "retry failed pages" / re-import dedup pass to map an
        // imported note back to its OneNote page.
        expect(pageOne?.getOwnedLabelValue("oneNotePageId")).toBe("1-abc");
        expect(pageTwo?.getOwnedLabelValue("oneNotePageId")).toBe("1-def");

        // Container notes (section, notebook) are not OneNote pages and must not carry the label.
        const sectionNote = Object.values(becca.notes).find((note) => note.title === "Section");
        expect(sectionNote?.getOwnedLabelValue("oneNotePageId")).toBeNull();
    });
});
