import type { CompletionContext, CompletionResult } from "@triliumnext/codemirror/src/single_line";
import { describe, expect, it, vi } from "vitest";

import { searchCompletionSource } from "./search_completions";

// The descriptions are catalogue lookups, which specs don't initialize; the keys identify them.
vi.mock("../../services/i18n", () => ({ t: (key: string) => key }));

describe("searchCompletionSource", () => {
    it("offers the note object and the keywords while a word is being typed, anchored at its start", () => {
        const result = searchCompletionSource(contextAt("#book AND no"));

        expect(result?.from).toBe(10);
        expect(labelsOf(result)).toEqual([ "note", "and", "or", "not", "orderBy", "limit" ]);
        // Both complete with what has to follow them.
        expect(optionFor(result, "note")?.apply).toBe("note.");
        expect(optionFor(result, "not")?.apply).toBe("not(");
        expect(optionFor(result, "note")?.detail).toBe("search_completion.note");
    });

    it("offers the sort directions only once an orderBy is open", () => {
        expect(labelsOf(searchCompletionSource(contextAt("#book de")))).not.toContain("desc");

        const ordering = searchCompletionSource(contextAt("#book orderBy #year de"));

        expect(labelsOf(ordering)).toContain("desc");
        expect(optionFor(ordering, "asc")?.detail).toBe("order_by.asc");
    });

    it("offers every operator once one of their characters is typed", () => {
        const result = searchCompletionSource(contextAt("#year >"));

        expect(result?.from).toBe(6);
        expect(result?.options.map((option) => option.label)).toEqual([
            "=", "!=", "*=*", "=*", "*=", ">", ">=", "<", "<=", "%=", "~=", "~*"
        ]);
        expect(result?.options.every((option) => option.detail)).toBe(true);
    });

    it("offers path segments after a dot, anchored at the segment being typed", () => {
        const root = searchCompletionSource(contextAt("note."));

        expect(root?.from).toBe(5);
        expect(labelsOf(root)).toContain("title");
        expect(labelsOf(root)).toContain("parents");
        expect(labelsOf(root)).toContain("content");

        const partial = searchCompletionSource(contextAt("#book AND note.date"));

        expect(partial?.from).toBe(15);
        expect(labelsOf(partial)).toEqual(labelsOf(root));
    });

    it("walks a path through a relation and through a traversal", () => {
        expect(labelsOf(searchCompletionSource(contextAt("~author.")))).toContain("title");
        expect(labelsOf(searchCompletionSource(contextAt("note.parents.")))).toContain("title");
        expect(labelsOf(searchCompletionSource(contextAt("~author.relations.son.")))).toContain("title");
    });

    it("stops where the grammar expects a name or ends the path", () => {
        // Both take an attribute name, which nothing can enumerate ahead of time.
        expect(searchCompletionSource(contextAt("note.labels."))).toBeNull();
        expect(searchCompletionSource(contextAt("note.relations."))).toBeNull();
        // A terminal property has nothing to walk onto.
        expect(searchCompletionSource(contextAt("note.title."))).toBeNull();
        expect(searchCompletionSource(contextAt("note.labels.publicationYear."))).toBeNull();
    });

    it("stays quiet on empty space, and offers everything when asked explicitly", () => {
        expect(searchCompletionSource(contextAt("#book "))).toBeNull();

        const explicit = searchCompletionSource(contextAt("#book ", { explicit: true }));

        expect(explicit?.from).toBe(6);
        // The six words, then every operator.
        expect(explicit?.options).toHaveLength(18);
    });
});

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
