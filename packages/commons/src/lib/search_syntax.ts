/**
 * The property path a search query walks from a note: `note.title`, `note.parents.title`,
 * `~author.relations.son.title`. The segments are the ones `parseNoteProperty()` accepts.
 *
 * The search engine keeps the same property names in its own `PROP_MAPPING` tables; a spec in
 * `trilium-core` holds this list against what the engine actually accepts.
 */
export const SEARCH_NOTE_PATH = {
    /** Compared against a value, so an operator follows: `note.title = x`. */
    properties: [
        "noteId",
        "title",
        "type",
        "mime",
        "isProtected",
        "isArchived",
        "dateCreated",
        "dateModified",
        "utcDateCreated",
        "utcDateModified",
        "parentCount",
        "childrenCount",
        "attributeCount",
        "labelCount",
        "ownedLabelCount",
        "relationCount",
        "ownedRelationCount",
        "relationCountIncludingLinks",
        "ownedRelationCountIncludingLinks",
        "targetRelationCount",
        "targetRelationCountIncludingLinks",
        "contentSize",
        "contentAndAttachmentsSize",
        "contentAndAttachmentsAndRevisionsSize",
        "revisionCount"
    ],
    /** Matched against the note's text through a full-text expression rather than a property. */
    contentProperties: [ "content", "rawContent", "text" ],
    /** Step onto another note, so a further segment follows: `note.parents.title`. */
    traversals: [ "parents", "children", "ancestors" ],
    /** Expect an attribute name next, which nothing can enumerate ahead of time. */
    attributeSegments: [ "labels", "relations" ]
} as const;

/** Every segment that can stand directly after a `.` in a property path. */
export const SEARCH_NOTE_PATH_SEGMENTS: readonly string[] = [
    ...SEARCH_NOTE_PATH.properties,
    ...SEARCH_NOTE_PATH.contentProperties,
    ...SEARCH_NOTE_PATH.traversals,
    ...SEARCH_NOTE_PATH.attributeSegments
];
