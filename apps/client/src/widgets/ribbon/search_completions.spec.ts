import type { CompletionContext } from "@triliumnext/codemirror/src/single_line";
import { describe, expect, it, vi } from "vitest";

import { searchCompletionSource } from "./search_completions";

// The descriptions are catalogue lookups, which specs don't initialize; the keys identify them.
vi.mock("../../services/i18n", () => ({ t: (key: string) => key }));

describe("searchCompletionSource", () => {
    it("offers the note object while a word is being typed, anchored at its start", () => {
        const result = searchCompletionSource(contextAt("#book AND no"));

        expect(result?.from).toBe(10);
        expect(result?.options.map((option) => option.label)).toEqual([ "note" ]);
        // A bare `note` is never a complete clause, so the dot comes with it.
        expect(result?.options[0].apply).toBe("note.");
        expect(result?.options[0].detail).toBe("search_completion.note");
    });

    it("offers every operator once one of their characters is typed", () => {
        const result = searchCompletionSource(contextAt("#year >"));

        expect(result?.from).toBe(6);
        expect(result?.options.map((option) => option.label)).toEqual([
            "=", "!=", "*=*", "=*", "*=", ">", ">=", "<", "<=", "%=", "~=", "~*"
        ]);
        expect(result?.options.every((option) => option.detail)).toBe(true);
    });

    it("stays quiet on empty space, and offers everything when asked explicitly", () => {
        expect(searchCompletionSource(contextAt("#book "))).toBeNull();

        const explicit = searchCompletionSource(contextAt("#book ", { explicit: true }));

        expect(explicit?.from).toBe(6);
        expect(explicit?.options).toHaveLength(13);
    });
});

/** Stands in for the editor's context, whose `matchBefore` anchors the pattern at the cursor. */
function contextAt(text: string, { explicit = false } = {}): CompletionContext {
    const pos = text.length;

    return {
        pos,
        explicit,
        matchBefore(expr: RegExp) {
            const match = new RegExp(`(?:${expr.source})$`).exec(text);
            return match ? { from: pos - match[0].length, to: pos, text: match[0] } : null;
        }
    } as unknown as CompletionContext;
}
