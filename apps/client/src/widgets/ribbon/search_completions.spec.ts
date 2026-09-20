import type { CompletionContext, CompletionResult } from "@triliumnext/codemirror/src/single_line";
import { beforeEach, describe, expect, it, vi } from "vitest";

import server from "../../services/server";
import { fetchAttributeNames } from "../attribute_widgets/attribute_detail";
import { searchCompletionIcon, searchCompletionSource } from "./search_completions";

// The descriptions are catalogue lookups, which specs don't initialize; the keys identify them.
vi.mock("../../services/i18n", () => ({ t: (key: string) => key }));
// Stubbed at the same seam the sidebar's picker fetches through, so the spec needs no server and
// none of the attribute popup behind it. `isBuiltinAttribute` is left real: what it marks is the
// point of these tests.
vi.mock("../attribute_widgets/attribute_detail", () => ({ fetchAttributeNames: vi.fn() }));
// Modules loaded behind `services/attributes` request through this one as they load, so the stub
// answers from the start rather than from the first `beforeEach`.
vi.mock("../../services/server", () => ({ default: { get: vi.fn(async () => []) } }));

beforeEach(() => {
    vi.mocked(fetchAttributeNames).mockReset().mockResolvedValue([ "book", "archived" ]);
    vi.mocked(server.get).mockReset().mockResolvedValue([ "fiction", "science fiction" ]);
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

            expect(fetchAttributeNames).toHaveBeenCalledWith("label", "");
            expect(result?.from).toBe(8);
            expect(labelsOf(result)).toEqual([ "book", "archived" ]);

            expect((await complete("#!bo"))?.from).toBe(2);
        });

        it("ranks a built-in below a name of the user's own that matches as well", async () => {
            const result = await complete("#a");

            expect(optionFor(result, "archived")?.boost).toBe(-99);
            expect(optionFor(result, "book")?.boost).toBeUndefined();
        });

        it("fetches relations for ~, and for the segment after note.relations.", async () => {
            await complete("~aut");

            expect(fetchAttributeNames).toHaveBeenCalledWith("relation", "");

            const inPath = await complete("note.relations.aut");

            expect(fetchAttributeNames).toHaveBeenLastCalledWith("relation", "");
            expect(inPath?.from).toBe(15);
            expect(labelsOf(inPath)).toEqual([ "book", "archived" ]);
        });

        it("fetches labels for the segment after note.labels.", async () => {
            const result = await complete("note.labels.");

            expect(fetchAttributeNames).toHaveBeenCalledWith("label", "");
            expect(result?.from).toBe(12);
        });

        it("leaves the fuzzy operators to the operator branch", async () => {
            expect(labelsOf(await complete("note.title ~="))).toContain("~=");
            expect(fetchAttributeNames).not.toHaveBeenCalled();
        });

        it("offers nothing when the request fails", async () => {
            vi.mocked(fetchAttributeNames).mockRejectedValue(new Error("offline"));

            expect(await complete("#bo")).toBeNull();
        });
    });

    describe("attribute values", () => {
        it("offers the values a label holds, anchored at the value and quoted where the lexer would split it", async () => {
            const result = await complete("#genre = fic");

            expect(server.get).toHaveBeenCalledWith("attribute-values/genre");
            expect(result?.from).toBe(9);
            expect(labelsOf(result)).toEqual([ "fiction", "science fiction" ]);
            expect(optionFor(result, "fiction")?.apply).toBeUndefined();
            expect(optionFor(result, "science fiction")?.apply).toBe("\"science fiction\"");
        });

        it("closes a quote the user opened rather than adding another", async () => {
            const result = await complete("#genre = \"science f");

            expect(result?.from).toBe(10);
            expect(optionFor(result, "science fiction")?.apply).toBe("science fiction\"");
        });

        it("leaves the operator being typed to the operator branch", async () => {
            expect(labelsOf(await complete("#genre ="))).toContain("=*");
            expect(server.get).not.toHaveBeenCalled();
        });

        it("stops once the value is finished, so the keywords follow it", async () => {
            expect(labelsOf(await complete("#genre = fiction an"))).toContain("and");
            expect(labelsOf(await complete("#genre = \"science fiction\" an"))).toContain("and");
            expect(server.get).not.toHaveBeenCalled();
        });

        it("follows a value through note.labels., and leaves relations alone", async () => {
            await complete("note.labels.genre *=* fic");

            expect(server.get).toHaveBeenCalledWith("attribute-values/genre");

            // The endpoint collects label values only; a relation's value is a note ID.
            await complete("~author = jo");

            expect(server.get).toHaveBeenCalledTimes(1);
        });

        it("offers nothing when the request fails", async () => {
            vi.mocked(server.get).mockRejectedValue(new Error("offline"));

            expect(await complete("#genre = fic")).toBeNull();
        });
    });
});

describe("searchCompletionIcon", () => {
    it("draws attribute names, the system ones with a cog rather than their own kind", async () => {
        vi.mocked(fetchAttributeNames).mockResolvedValue([ "book", "archived" ]);
        const labels = await complete("#a");

        expect(iconFor(labels, "book")).toBe("bx bx-hash");
        expect(iconFor(labels, "archived")).toBe("bx bx-cog");

        vi.mocked(fetchAttributeNames).mockResolvedValue([ "author", "template", "archived" ]);
        const relations = await complete("~a");

        expect(iconFor(relations, "author")).toBe("bx bx-transfer");
        expect(iconFor(relations, "template")).toBe("bx bx-cog");
        // Built-in as a label, an ordinary name as a relation.
        expect(iconFor(relations, "archived")).toBe("bx bx-transfer");
    });

    it("leaves everything else undrawn", async () => {
        expect(iconFor(await complete("no"), "note")).toBeUndefined();
        expect(iconFor(await complete("or"), "orderBy")).toBeUndefined();
        expect(iconFor(await complete("note."), "title")).toBeUndefined();
        expect(iconFor(await complete("#year >"), ">=")).toBeUndefined();
    });
});

function iconFor(result: CompletionResult | null, label: string) {
    const option = optionFor(result, label);

    return option ? searchCompletionIcon(option) : "no such option";
}

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
