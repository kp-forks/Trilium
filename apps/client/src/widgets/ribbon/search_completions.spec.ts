import type { CompletionContext, CompletionResult } from "@triliumnext/codemirror/src/single_line";
import { beforeEach, describe, expect, it, vi } from "vitest";

import server from "../../services/server";
import { searchCompletionSource } from "./search_completions";

// The descriptions are catalogue lookups, which specs don't initialize; the keys identify them.
vi.mock("../../services/i18n", () => ({ t: (key: string) => key }));
vi.mock("../../services/server", () => ({ default: { get: vi.fn() } }));

beforeEach(() => {
    vi.mocked(server.get).mockReset().mockResolvedValue([ "book", "publicationYear" ]);
});

describe("searchCompletionSource", () => {
    it("offers the note object and the keywords while a word is being typed, anchored at its start", async () => {
        const result = await complete("#book AND no");

        expect(result?.from).toBe(10);
        expect(labelsOf(result)).toEqual([ "note", "and", "or", "not", "orderBy", "limit" ]);
        // Both complete with what has to follow them.
        expect(optionFor(result, "note")?.apply).toBe("note.");
        expect(optionFor(result, "not")?.apply).toBe("not(");
        expect(optionFor(result, "note")?.detail).toBe("search_completion.note");
    });

    it("offers the sort directions only once an orderBy is open", async () => {
        expect(labelsOf(await complete("#book de"))).not.toContain("desc");

        const ordering = await complete("#book orderBy #year de");

        expect(labelsOf(ordering)).toContain("desc");
        expect(optionFor(ordering, "asc")?.detail).toBe("order_by.asc");
    });

    it("offers every operator once one of their characters is typed", async () => {
        const result = await complete("#year >");

        expect(result?.from).toBe(6);
        expect(labelsOf(result)).toEqual([
            "=", "!=", "*=*", "=*", "*=", ">", ">=", "<", "<=", "%=", "~=", "~*"
        ]);
        expect(result?.options.every((option) => option.detail)).toBe(true);
    });

    it("offers path segments after a dot, anchored at the segment being typed", async () => {
        const root = await complete("note.");

        expect(root?.from).toBe(5);
        expect(labelsOf(root)).toContain("title");
        expect(labelsOf(root)).toContain("parents");
        expect(labelsOf(root)).toContain("content");

        const partial = await complete("#book AND note.date");

        expect(partial?.from).toBe(15);
        expect(labelsOf(partial)).toEqual(labelsOf(root));
    });

    it("walks a path through a relation and through a traversal", async () => {
        expect(labelsOf(await complete("~author."))).toContain("title");
        expect(labelsOf(await complete("note.parents."))).toContain("title");
        expect(labelsOf(await complete("~author.relations.son."))).toContain("title");
    });

    it("stops where a terminal property ends the path", async () => {
        expect(await complete("note.title.")).toBeNull();
        expect(await complete("note.labels.publicationYear.")).toBeNull();
    });

    it("stays quiet on empty space, and offers everything when asked explicitly", async () => {
        expect(await complete("#book ")).toBeNull();

        const explicit = await complete("#book ", { explicit: true });

        expect(explicit?.from).toBe(6);
        // The six words, then every operator.
        expect(explicit?.options).toHaveLength(18);
    });

    describe("attribute names", () => {
        it("fetches labels for #, anchored past the prefix and past a negation", async () => {
            const result = await complete("towers #bo");

            expect(server.get).toHaveBeenCalledWith("attribute-names/?type=label&query=");
            expect(result?.from).toBe(8);
            expect(labelsOf(result)).toEqual([ "book", "publicationYear" ]);

            expect((await complete("#!bo"))?.from).toBe(2);
        });

        it("fetches relations for ~, and for the segment after note.relations.", async () => {
            await complete("~aut");

            expect(server.get).toHaveBeenCalledWith("attribute-names/?type=relation&query=");

            const inPath = await complete("note.relations.aut");

            expect(server.get).toHaveBeenLastCalledWith("attribute-names/?type=relation&query=");
            expect(inPath?.from).toBe(15);
            expect(labelsOf(inPath)).toEqual([ "book", "publicationYear" ]);
        });

        it("fetches labels for the segment after note.labels.", async () => {
            const result = await complete("note.labels.");

            expect(server.get).toHaveBeenCalledWith("attribute-names/?type=label&query=");
            expect(result?.from).toBe(12);
        });

        it("leaves the fuzzy operators to the operator branch", async () => {
            expect(labelsOf(await complete("note.title ~="))).toContain("~=");
            expect(server.get).not.toHaveBeenCalled();
        });

        it("offers nothing when the request fails", async () => {
            vi.mocked(server.get).mockRejectedValue(new Error("offline"));

            expect(await complete("#bo")).toBeNull();
        });
    });
});

async function complete(text: string, opts?: { explicit?: boolean }) {
    return await searchCompletionSource(contextAt(text, opts));
}

function labelsOf(result: CompletionResult | null): string[] {
    return (result?.options ?? []).map((option) => option.label);
}

function optionFor(result: CompletionResult | null, label: string) {
    return result?.options.find((option) => option.label === label);
}

/** Stands in for the editor's context, whose `matchBefore` anchors the pattern at the cursor. */
function contextAt(text: string, { explicit = false } = {}): CompletionContext {
    const pos = text.length;

    return {
        pos,
        explicit,
        matchBefore(expr: RegExp) {
            // Flags carry over, the way CodeMirror's own `ensureAnchor` keeps them.
            const match = new RegExp(`(?:${expr.source})$`, expr.flags).exec(text);
            return match ? { from: pos - match[0].length, to: pos, text: match[0] } : null;
        }
    } as unknown as CompletionContext;
}
