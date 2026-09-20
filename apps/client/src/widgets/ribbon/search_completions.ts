import { SEARCH_NOTE_PATH, SEARCH_NOTE_PATH_SEGMENTS } from "@triliumnext/commons";
import type { Completion, CompletionContext, CompletionResult } from "@triliumnext/codemirror/src/single_line";

import { t } from "../../services/i18n";

/**
 * Offers Trilium's search syntax: the `note` object, the property path that hangs off it or off a
 * relation, and the comparison operators, whose spellings (`*=*`, `=*`, `~=`) are the part of the
 * syntax hardest to recall.
 *
 * Attribute names and values are not offered — reading those needs the notes being searched, which
 * a source built from static text cannot see.
 */
export function searchCompletionSource(context: CompletionContext): CompletionResult | null {
    const path = context.matchBefore(PROPERTY_PATH);
    if (path) {
        return pathCompletions(path.text, context.pos);
    }

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
/** A name runs until whitespace or a structural character, as it does in the lexer. */
const SEGMENT = "[^\\s#~().,=<>*!%+\\-'\"`]";
/** The `note` object or a relation, followed by the dotted path walked from it. */
const PROPERTY_PATH = new RegExp(`(?:^|[\\s(])(?:note|~${SEGMENT}+)(?:\\.${SEGMENT}*)+`);
const SEGMENT_TYPED = new RegExp(`${SEGMENT}*`);

/**
 * Completes the segment being typed at the end of `path`, where the grammar allows one. Nothing is
 * offered after `note.labels.`, which expects a label name, or after `note.title.`, which is the
 * end of the path — a terminal property has nothing to walk onto.
 */
function pathCompletions(path: string, pos: number): CompletionResult | null {
    const segments = path.split(".");
    const typed = segments[segments.length - 1];
    const previous = segments[segments.length - 2];
    const beforeThat = segments[segments.length - 3];

    // A segment follows the root, a traversal, or the relation name reached through `relations`.
    const isAllowed = segments.length === 2
        || (SEARCH_NOTE_PATH.traversals as readonly string[]).includes(previous)
        || beforeThat === "relations";

    if (!isAllowed) {
        return null;
    }

    return { from: pos - typed.length, options: segmentOptions(), validFor: SEGMENT_TYPED };
}

/**
 * The options are built per request rather than once, so they read the catalogue after i18n has
 * loaded and follow a language switched while the app is running.
 */
function objectOptions(): Completion[] {
    // `note.` completes with the dot, since a bare `note` is never a complete clause.
    return [ { label: "note", apply: "note.", type: "namespace", detail: t("search_completion.note") } ];
}

function segmentOptions(): Completion[] {
    return SEARCH_NOTE_PATH_SEGMENTS.map((segment) => ({
        label: segment,
        type: "property",
        detail: SEGMENT_DETAILS[segment] ? t(SEGMENT_DETAILS[segment]) : undefined
    }));
}

/**
 * Glosses for the segments whose name does not already say what they hold. Several are the labels
 * the order-by dropdown offers for the same properties, which read the same way here.
 */
const SEGMENT_DETAILS: Record<string, string> = {
    content: "search_completion.property_content",
    rawContent: "search_completion.property_raw_content",
    text: "search_completion.property_text",
    parents: "search_completion.property_parents",
    children: "search_completion.property_children",
    ancestors: "search_completion.property_ancestors",
    labels: "search_completion.property_labels",
    relations: "search_completion.property_relations",
    attributeCount: "search_completion.property_attribute_count",
    labelCount: "search_completion.property_label_count",
    relationCount: "search_completion.property_relation_count",
    relationCountIncludingLinks: "search_completion.property_relation_count_including_links",
    ownedRelationCountIncludingLinks: "search_completion.property_owned_relation_count_including_links",
    targetRelationCountIncludingLinks: "search_completion.property_target_relation_count_including_links",
    parentCount: "order_by.parent_count",
    childrenCount: "order_by.children_count",
    ownedLabelCount: "order_by.owned_label_count",
    ownedRelationCount: "order_by.owned_relation_count",
    targetRelationCount: "order_by.target_relation_count",
    contentSize: "order_by.content_size",
    contentAndAttachmentsSize: "order_by.content_and_attachments_size",
    contentAndAttachmentsAndRevisionsSize: "order_by.content_and_attachments_and_revisions_size",
    revisionCount: "order_by.revision_count"
};

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
