/**
 * Types for Anytype's JSON ("any-block") export. Each object is a single `.pb.json` file holding a
 * `snapshot` whose `data.blocks` is a flat list forming a tree (linked by `childrenIds`), plus a `details`
 * map carrying the object's name, layout and property values. This basic importer reads only the page
 * objects and their plain text; relations, types, collections and inline formatting are modelled
 * minimally (or not at all) for now and will be filled in as the importer is extended.
 */

/** A `[from, to)` character range a mark applies to. Offsets are UTF-16 code units (Anytype's editor is
 * JS/Electron), so they line up with JavaScript string indexing. */
export interface AnytypeMarkRange {
    from?: number;
    to?: number;
}

/** An inline formatting span over a text block's `text`. `type` is the kind (Bold, Italic, Strikethrough,
 * Underscored, Keyboard, TextColor, …); `param` carries extra data for some kinds (a colour name, a link
 * URL). Marks may overlap freely and are not pre-sorted. */
export interface AnytypeMark {
    range?: AnytypeMarkRange;
    type?: string;
    param?: string;
}

/** The text payload of a text block. Anytype has many `style`s (Paragraph, Header1, Numbered, …) and a
 * `marks.marks` list of inline formatting spans over `text`. */
export interface AnytypeText {
    text?: string;
    style?: string;
    marks?: {
        marks?: AnytypeMark[];
    };
}

/** A single block in an object's `snapshot.data.blocks`. Non-text blocks (links, dividers, dataviews, …)
 * carry other keys this importer doesn't read yet; only `id`, `childrenIds` and `text` are needed to pull
 * out the page's text content in document order. */
export interface AnytypeBlock {
    id: string;
    childrenIds?: string[];
    text?: AnytypeText;
}

/** The object's `snapshot.data.details` — its metadata map. `layout` distinguishes a basic page (0) from
 * a set/collection (3) and other system layouts; `name` is the title; `id` matches the root block's id.
 * `layout` is omitted when it's the default (0), so `resolvedLayout` (always present) is the reliable
 * source of the effective layout. */
export interface AnytypeDetails {
    id?: string;
    name?: string;
    layout?: number;
    resolvedLayout?: number;
}

/** One exported object file: `sbType` is the smartblock kind ("Page", "Participant", "Workspace", …) and
 * `snapshot.data` holds the blocks and details. */
export interface AnytypeSnapshot {
    sbType?: string;
    snapshot?: {
        data?: {
            blocks?: AnytypeBlock[];
            details?: AnytypeDetails;
            objectTypes?: string[];
        };
    };
}

/** A page parsed down to what the basic importer needs to create a Trilium note. */
export interface ParsedObject {
    /** The object's id (the root block's id); used later to resolve cross-object links. */
    id: string;
    title: string;
    /** Body HTML — for now, the concatenated text blocks wrapped in `<p>`. */
    content: string;
}
