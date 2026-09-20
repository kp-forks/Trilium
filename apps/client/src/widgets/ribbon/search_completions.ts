import type { Completion, CompletionContext, CompletionResult } from "@triliumnext/codemirror/src/single_line";

import { t } from "../../services/i18n";

/**
 * Offers the top level of Trilium's search syntax: the `note` object a property path hangs off,
 * and the comparison operators, whose spellings (`*=*`, `=*`, `~=`) are the part of the syntax
 * hardest to recall.
 *
 * Attribute names, property names and values are not offered yet — reading those needs the note
 * being searched, which a source built from static text cannot see.
 */
export function searchCompletionSource(context: CompletionContext): CompletionResult | null {
    const operator = context.matchBefore(OPERATOR_PREFIX);
    if (operator) {
        return { from: operator.from, options: operatorOptions(), validFor: OPERATOR_PREFIX };
    }

    const word = context.matchBefore(WORD_PREFIX);
    if (word) {
        return { from: word.from, options: objectOptions(), validFor: WORD_PREFIX };
    }

    // Ctrl-Space on empty space asks for everything on offer.
    if (context.explicit) {
        return { from: context.pos, options: [ ...objectOptions(), ...operatorOptions() ] };
    }

    return null;
}

/** The characters an operator is spelled with, so typing any of them starts offering them. */
const OPERATOR_PREFIX = /[=!*<>%~]+/;
const WORD_PREFIX = /[a-zA-Z]+/;

/**
 * The options are built per request rather than once, so they read the catalogue after i18n has
 * loaded and follow a language switched while the app is running.
 */
function objectOptions(): Completion[] {
    // `note.` completes with the dot, since a bare `note` is never a complete clause.
    return [ { label: "note", apply: "note.", type: "namespace", detail: t("search_completion.note") } ];
}

function operatorOptions(): Completion[] {
    return [
        { label: "=", detail: t("search_completion.operator_equal") },
        { label: "!=", detail: t("search_completion.operator_not_equal") },
        { label: "*=*", detail: t("search_completion.operator_contains") },
        { label: "=*", detail: t("search_completion.operator_starts_with") },
        { label: "*=", detail: t("search_completion.operator_ends_with") },
        { label: ">", detail: t("search_completion.operator_greater_than") },
        { label: ">=", detail: t("search_completion.operator_greater_or_equal") },
        { label: "<", detail: t("search_completion.operator_less_than") },
        { label: "<=", detail: t("search_completion.operator_less_or_equal") },
        { label: "%=", detail: t("search_completion.operator_regex") },
        { label: "~=", detail: t("search_completion.operator_fuzzy_equal") },
        { label: "~*", detail: t("search_completion.operator_fuzzy_contains") }
    ].map((option) => ({ ...option, type: "keyword" }));
}
