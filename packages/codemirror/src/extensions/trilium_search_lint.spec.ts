import { describe, expect, it } from "vitest";

import { diagnoseSearchQuery, type SearchLintMessages } from "./trilium_search_lint.js";

// The wording is the consumer's; the keys identify which rule answered.
const MESSAGES: SearchLintMessages = {
    relationNeedsProperty: "relation",
    textNeedsContains: "text",
    contentNotOrdered: "content",
    compareTheTitle: "fix-title",
    useOperator: (operator) => `fix-${operator}`
};

describe("diagnoseSearchQuery", () => {
    it("marks the operator a relation cannot take, and offers the property path in its place", () => {
        const [ diagnostic, ...rest ] = diagnoseSearchQuery("~author = tolkien", MESSAGES);

        expect(rest).toHaveLength(0);
        expect(diagnostic.message).toBe("relation");
        expect(diagnostic.severity).toBe("error");
        // The operator alone is underlined, not the relation that is spelled correctly.
        expect([ diagnostic.from, diagnostic.to ]).toEqual([ 8, 9 ]);
        expect(diagnostic.actions?.[0].name).toBe("fix-title");

        // Reached through a path as well as through the `~` prefix.
        expect(messagesFor("note.relations.author = x")).toEqual([ "relation" ]);
    });

    it("repairs a query into one the parser accepts, leaving the property name selected", () => {
        // Opening the path alone would leave `tolkien` behind it as an unrecognised property, so
        // the fix names the one the parser's own advice does.
        expect(applyFirstFix("~author = tolkien")).toEqual({
            query: "~author.title = tolkien",
            selected: "title"
        });
        expect(applyFirstFix("note.relations.author = x").query).toBe("note.relations.author.title = x");

        expect(applyFirstFix("note.text = hello")).toEqual({ query: "note.text *=* hello", selected: "" });
        expect(applyFirstFix("note.content >= hello").query).toBe("note.content *=* hello");
    });

    it("marks an operator the compared property does not accept", () => {
        expect(messagesFor("note.text = hello")).toEqual([ "text" ]);
        expect(messagesFor("~author.text > hello")).toEqual([ "text" ]);
        expect(messagesFor("note.content >= hello")).toEqual([ "content" ]);
        expect(messagesFor("note.rawContent < hello")).toEqual([ "content" ]);

        const [ diagnostic ] = diagnoseSearchQuery("note.text = hello", MESSAGES);
        expect(diagnostic.actions?.[0].name).toBe("fix-*=*");
    });

    it("stays quiet on everything the parser accepts", () => {
        for (const query of [
            "~author.title = tolkien",
            "~author",
            "#book = 1",
            "#book",
            "note.text *=* hello",
            "note.content *=* hello",
            "note.content ~= hello",
            "note.title >= 2019",
            // A name of the user's own after `labels.` restricts nothing.
            "note.labels.text = hello",
            "towers #book or #author",
            ""
        ]) {
            expect(messagesFor(query), query).toEqual([]);
        }
    });

    it("leaves an operator alone when a full-text word stands between it and the relation", () => {
        // `tolkien` is the query's full text, so the operator is not comparing `~author` at all
        // and the tokenizer does not emit a token for it.
        expect(messagesFor("~author tolkien = x")).toEqual([]);
    });

    it("marks each offending comparison in a query that holds several", () => {
        expect(messagesFor("#book = 1 ~author = x note.text = y")).toEqual([ "relation", "text" ]);
    });
});

function messagesFor(query: string) {
    return diagnoseSearchQuery(query, MESSAGES).map((diagnostic) => diagnostic.message);
}

/** Applies the first diagnostic's fix against a view that only records what it was handed. */
function applyFirstFix(query: string) {
    const [ diagnostic ] = diagnoseSearchQuery(query, MESSAGES);
    const action = diagnostic?.actions?.[0];
    if (!action) {
        throw new Error(`Nothing offered a fix for ${JSON.stringify(query)}.`);
    }

    let result = { query, selected: "" };
    const view = {
        dispatch: ({ changes, selection }: {
            changes: { from: number, to?: number, insert: string },
            selection: { anchor: number, head?: number }
        }) => {
            const edited = query.slice(0, changes.from) + changes.insert + query.slice(changes.to ?? changes.from);
            // No `head` is a plain cursor, which selects nothing.
            result = { query: edited, selected: edited.slice(selection.anchor, selection.head ?? selection.anchor) };
        }
    };

    action.apply(view as never, diagnostic.from, diagnostic.to);

    return result;
}
