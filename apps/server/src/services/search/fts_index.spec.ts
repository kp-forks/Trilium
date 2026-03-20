import { describe, it, expect } from "vitest";

describe("FTS Index Service", () => {
    it("should export buildIndex, updateNote, removeNote, searchContent functions", async () => {
        const ftsIndex = await import("./fts_index.js");
        expect(typeof ftsIndex.default.buildIndex).toBe("function");
        expect(typeof ftsIndex.default.updateNote).toBe("function");
        expect(typeof ftsIndex.default.removeNote).toBe("function");
        expect(typeof ftsIndex.default.searchContent).toBe("function");
        expect(typeof ftsIndex.default.isIndexBuilt).toBe("function");
        expect(typeof ftsIndex.default.resetIndex).toBe("function");
    });
});
