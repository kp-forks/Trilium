import type { Completion, CompletionContext, CompletionResult } from "@triliumnext/codemirror/src/single_line";
import { SEARCH_NOTE_PATH, SEARCH_NOTE_PATH_SEGMENTS } from "@triliumnext/commons";

import { isBuiltinAttribute } from "../../services/attributes";
import { t } from "../../services/i18n";
import { fetchAttributeNames } from "../attribute_widgets/attribute_detail";

/** A branch answers at once, or after the attribute names have been fetched. */
type CompletionOutcome = CompletionResult | Promise<CompletionResult | null> | null;

/**
 * Offers Trilium's search syntax: the `note` object, the keywords, the property path that hangs off
 * `note` or off a relation, the comparison operators — whose spellings (`*=*`, `=*`, `~=`) are the
 * part of the syntax hardest to recall — and the label and relation names in the database.
 *
 * Attribute values are not offered yet.
 */
export function searchCompletionSource(context: CompletionContext): CompletionOutcome {
    const path = context.matchBefore(PROPERTY_PATH);
    if (path) {
        return pathCompletions(path.text, context.pos);
    }

    // `~=` and `~*` reach the operators below instead: an attribute name cannot be spelled with
    // either character, so the pattern finds nothing ending at the cursor.
    const attribute = context.matchBefore(ATTRIBUTE_PREFIX);
    if (attribute) {
        const isNegated = attribute.text[1] === "!";

        return attributeCompletions(
            attribute.text[0] === "#" ? "label" : "relation",
            attribute.from + (isNegated ? 2 : 1)
        );
    }

    const operator = context.matchBefore(OPERATOR_PREFIX);
    if (operator) {
        return { from: operator.from, options: operatorOptions(), validFor: OPERATOR_PREFIX };
    }

    // `asc` and `desc` order an `orderBy` key, so they are worth offering only once one is open.
    const isOrdering = !!context.matchBefore(ORDER_BY_BEFORE);

    const word = context.matchBefore(WORD_PREFIX);
    if (word) {
        return { from: word.from, options: wordOptions(isOrdering), validFor: WORD_PREFIX };
    }

    // Ctrl-Space on empty space asks for everything on offer.
    if (context.explicit) {
        return { from: context.pos, options: [ ...wordOptions(isOrdering), ...operatorOptions() ] };
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
/** Matches once an `orderBy` has been opened anywhere before the cursor. */
const ORDER_BY_BEFORE = /orderby[^]*/i;
/** A `#label` or `~relation`, either optionally negated with `!`. */
const ATTRIBUTE_PREFIX = new RegExp(`[#~]!?${SEGMENT}*`);

/**
 * Fetches the label or relation names the database holds, through the same call the sidebar's
 * attribute picker makes, and marks the built-in ones as that picker does. The whole set is asked
 * for once and narrowed by `validFor` as more of the name is typed, rather than per keystroke.
 */
async function attributeCompletions(type: "label" | "relation", from: number): Promise<CompletionResult | null> {
    let names: string[];
    try {
        names = await fetchAttributeNames(type, "");
    } catch {
        return null;
    }

    return {
        from,
        options: names.map((name) => {
            const isBuiltin = isBuiltinAttribute(type, name);

            return {
                label: name,
                type: isBuiltin ? SYSTEM_ATTRIBUTE : type,
                boost: isBuiltin ? BUILTIN_BOOST : undefined
            };
        }),
        validFor: SEGMENT_TYPED
    };
}

/** Stands in for a completion's own type, a name Trilium attaches a meaning to being marked first. */
const SYSTEM_ATTRIBUTE = "system-attribute";

/**
 * The furthest CodeMirror lets an option be moved down, which it adds to the match score. Penalties
 * there run to the hundreds, so a built-in sinks below a name of the user's own that matches as
 * well, while a distinctly better match keeps its place.
 */
const BUILTIN_BOOST = -99;

const COMPLETION_ICONS: Record<string, string> = {
    [SYSTEM_ATTRIBUTE]: "bx bx-cog",
    label: "bx bx-hash",
    relation: "bx bx-transfer"
};

/** The icon an option is drawn with. Only the attribute names carry one. */
export function searchCompletionIcon(completion: Completion): string | undefined {
    return completion.type ? COMPLETION_ICONS[completion.type] : undefined;
}

/**
 * Completes the segment being typed at the end of `path`. After `note.labels.` or
 * `note.relations.` that is an attribute name; after `note.title.` it is nothing at all, a
 * terminal property having nothing to walk onto.
 */
function pathCompletions(path: string, pos: number): CompletionOutcome {
    const segments = path.split(".");
    const typed = segments[segments.length - 1];
    const previous = segments[segments.length - 2];
    const beforeThat = segments[segments.length - 3];
    const from = pos - typed.length;

    if (previous === "labels" || previous === "relations") {
        return attributeCompletions(previous === "labels" ? "label" : "relation", from);
    }

    // A segment follows the root, a traversal, or the relation name reached through `relations`.
    const isAllowed = segments.length === 2
        || (SEARCH_NOTE_PATH.traversals as readonly string[]).includes(previous)
        || beforeThat === "relations";

    if (!isAllowed) {
        return null;
    }

    return { from, options: segmentOptions(), validFor: SEGMENT_TYPED };
}

/**
 * Everything spelled as a word: the `note` object and the keywords that join, order and cut down a
 * query. Built per request rather than once, so the options read the catalogue after i18n has
 * loaded and follow a language switched while the app is running.
 */
function wordOptions(isOrdering: boolean): Completion[] {
    const options: Completion[] = [
        // Both complete with what has to follow them: a bare `note`, or a `not` without its
        // parenthesised sub-expression, is never a clause on its own.
        { label: "note", apply: "note.", type: "namespace", detail: t("search_completion.note") },
        { label: "and", type: "keyword", detail: t("search_completion.keyword_and") },
        { label: "or", type: "keyword", detail: t("search_completion.keyword_or") },
        { label: "not", apply: "not(", type: "keyword", detail: t("search_completion.keyword_not") },
        { label: "orderBy", type: "keyword", detail: t("search_completion.keyword_order_by") },
        { label: "limit", type: "keyword", detail: t("search_completion.keyword_limit") }
    ];

    if (isOrdering) {
        options.push(
            { label: "asc", type: "keyword", detail: t("order_by.asc") },
            { label: "desc", type: "keyword", detail: t("order_by.desc") }
        );
    }

    return options;
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
