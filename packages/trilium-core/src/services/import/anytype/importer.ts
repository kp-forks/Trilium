/**
 * Imports an Anytype JSON ("any-block") export zip into a Trilium note tree.
 *
 * Anytype exports each object as a single `objects/<cid>.pb.json` file (the protobuf export uses `.pb`
 * instead — not handled here), alongside sibling `relations/`, `types/`, `templates/` and `relationsOptions/`
 * folders. This importer reads the *pages* (basic note-like objects) and converts each text block to HTML:
 * headings, inline marks (bold/italic/strikethrough/underline/inline-code and text/background colours),
 * code blocks (with the language preserved as the Trilium MIME), bullet/numbered/task lists (grouped and
 * nested), toggles (normal toggles → collapsible blocks; toggle headings → plain headings), callouts
 * (→ admonitions), quotes/highlights (→ `<blockquote>`), dividers (→ `<hr>`) and cross-page links
 * (Anytype's block-level "link to object" → a Trilium reference link plus an `internalLink` relation, so
 * backlinks resolve). Each page keeps its original creation and modification timestamps. Relations, types
 * and collections are still deferred, and every page lands as a flat child of a fresh "Anytype import"
 * root (no hierarchy yet).
 *
 * Invoked from the shared file-import dispatcher (routes/api/import.ts) when the upload is tagged
 * `format=anytype`, so progress, completion and failure are reported by that dispatcher's TaskContext —
 * this service just builds the tree and returns its root note, like the zip/notion importers.
 */

import { getMimeTypeFromMarkdownName, MIME_TYPE_AUTO, normalizeMimeTypeForCKEditor } from "@triliumnext/commons/src/lib/mime_type.js";
import { t } from "i18next";

import type BNote from "../../../becca/entities/bnote.js";
import noteService from "../../notes.js";
import protectedSessionService from "../../protected_session.js";
import type TaskContext from "../../task_context.js";
import date_utils from "../../utils/date.js";
import { escapeHtml, newEntityId } from "../../utils/index.js";
import { getZipProvider } from "../../zip_provider.js";

async function importAnytype(taskContext: TaskContext<"importNotes">, fileBuffer: Uint8Array, importRootNote: BNote): Promise<BNote> {
    const snapshots = await parseZip(fileBuffer);
    const pageSnapshots = snapshots.filter(isPage);

    // Assign each page its Trilium note id up front so cross-page links resolve even when they point at a
    // page that hasn't been created yet (links routinely point forward in the export). The note is later
    // created with this forced id, keeping the reference link's href and the real note in sync.
    const targets = new Map<string, ResolvedLink>();
    for (const snapshot of pageSnapshots) {
        const details = snapshot.snapshot?.data?.details;
        const cid = details?.id;
        if (cid) {
            targets.set(cid, { noteId: newEntityId(), title: pageTitle(details) });
        }
    }
    const resolveLink: LinkResolver = (cid) => targets.get(cid);

    const pages = pageSnapshots.map((snapshot) => parseObject(snapshot, resolveLink));
    taskContext.setTotalCount(pages.length);

    return createNotes(importRootNote, pages, targets, taskContext);
}

/**
 * Reads every `objects/*.pb.json` entry as a parsed Anytype snapshot. Sibling folders (relations, types, …)
 * and the protobuf `.pb` files are ignored for now. A malformed entry is skipped rather than failing the
 * whole import.
 */
async function parseZip(fileBuffer: Uint8Array): Promise<AnytypeSnapshot[]> {
    const provider = getZipProvider();
    const snapshots: AnytypeSnapshot[] = [];
    const filenameEncoding = await provider.detectFilenameEncoding(fileBuffer);

    await provider.readZipFile(fileBuffer, async (entry, readContent) => {
        if (!isObjectEntry(entry.fileName)) {
            return;
        }
        try {
            snapshots.push(JSON.parse(new TextDecoder().decode(await readContent())) as AnytypeSnapshot);
        } catch {
            // A non-JSON or truncated entry under objects/ isn't a page we can import — skip it.
        }
    }, filenameEncoding);

    return snapshots;
}

/** True for entries that are JSON object files under the export's `objects/` folder. */
function isObjectEntry(fileName: string): boolean {
    const normalized = fileName.replace(/\\/g, "/").toLowerCase();
    return normalized.startsWith("objects/") && normalized.endsWith(".pb.json");
}

/**
 * Whether a snapshot is a page we should import. A page is a `Page` smartblock with the basic layout (0);
 * this excludes sets/collections (layout 3) and system objects like the participant, workspace and
 * dashboard widget. Conservative on purpose — other content layouts can be admitted as the importer grows.
 *
 * Anytype omits `layout` when it's the default (Basic = 0) — a single-object export of a basic page has no
 * `layout` field at all — so we fall back to `resolvedLayout` (always present) and treat a wholly missing
 * value as basic. Sets and other non-page layouts are still excluded by their non-zero value.
 */
export function isPage(snapshot: AnytypeSnapshot): boolean {
    if (snapshot.sbType !== "Page") {
        return false;
    }
    const details = snapshot.snapshot?.data?.details;
    const layout = details?.layout ?? details?.resolvedLayout ?? 0;
    return layout === 0;
}

/**
 * Reduces a page snapshot to the title, body HTML and outgoing link targets needed to create a note.
 * `resolveLink` maps a linked object's id to the Trilium note it became; without one (parsing a page in
 * isolation) link blocks are dropped, since they can't be pointed anywhere yet.
 */
export function parseObject(snapshot: AnytypeSnapshot, resolveLink: LinkResolver = () => undefined): ParsedObject {
    const data = snapshot.snapshot?.data;
    const details = data?.details ?? {};
    const id = details.id ?? "";
    const title = pageTitle(details);
    const { html, linkTargetIds } = extractContent(data?.blocks ?? [], id, resolveLink);

    return {
        id,
        title,
        content: html,
        linkTargetIds,
        dateCreated: anytypeDate(details.createdDate),
        dateModified: anytypeDate(details.lastModifiedDate)
    };
}

/** The note title for a page: its trimmed `details.name`, or "Untitled" when blank. */
function pageTitle(details: AnytypeDetails | undefined): string {
    return (details?.name ?? "").trim() || "Untitled";
}

/**
 * Converts an Anytype detail date (a Unix timestamp in *seconds*) to a Trilium UTC datetime string, or
 * undefined for a missing or non-positive value — system objects export `0`, which would otherwise become
 * a 1970 date.
 */
export function anytypeDate(seconds: number | undefined): string | undefined {
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
        return undefined;
    }
    return date_utils.utcDateTimeStr(new Date(seconds * 1000));
}

/**
 * Converts the page's block tree to HTML. A sequence of sibling blocks is rendered in document order, with
 * consecutive list items of the same kind grouped into a single `<ul>`/`<ol>`/todo-list and a list item's
 * children nested inside its `<li>`. Other blocks become a code block, a heading (`<h2>`/`<h3>`/`<h4>`), a
 * cross-page reference link or a `<p>`, with inline marks applied. The `header` subtree
 * (title/description/featuredRelations chrome) is skipped, as are the structural Title and Description
 * styles wherever they appear. The de-duplicated Trilium ids of every linked-to page are returned
 * alongside the HTML so the caller can record the `internalLink` relations.
 */
function extractContent(blocks: AnytypeBlock[], rootId: string, resolveLink: LinkResolver): { html: string; linkTargetIds: string[] } {
    const byId = new Map<string, AnytypeBlock>();
    for (const block of blocks) {
        byId.set(block.id, block);
    }

    const root = (rootId ? byId.get(rootId) : undefined) ?? blocks[0];
    if (!root) {
        return { html: "", linkTargetIds: [] };
    }

    const visited = new Set<string>();
    const linkTargetIds = new Set<string>();

    // Renders a run of sibling ids, grouping consecutive same-kind list items into one list. The header
    // chrome and already-visited blocks (a node reachable twice) are skipped.
    function renderSequence(ids: string[]): string {
        const parts: string[] = [];
        let i = 0;
        while (i < ids.length) {
            const id = ids[i];
            const block = id === "header" || visited.has(id) ? undefined : byId.get(id);
            if (!block) {
                i++;
                continue;
            }

            const kind = listKind(block);
            if (kind) {
                const run: AnytypeBlock[] = [];
                while (i < ids.length) {
                    const candidate = visited.has(ids[i]) ? undefined : byId.get(ids[i]);
                    if (!candidate || listKind(candidate) !== kind) {
                        break;
                    }
                    visited.add(ids[i]);
                    run.push(candidate);
                    i++;
                }
                parts.push(renderList(kind, run));
            } else {
                visited.add(id);
                parts.push(renderLeaf(block));
                i++;
            }
        }
        return parts.join("");
    }

    function renderList(kind: ListKind, items: AnytypeBlock[]): string {
        const body = items.map((item) => renderItem(kind, item)).join("");
        if (kind === "task") {
            return `<ul class="todo-list">${body}</ul>`;
        }
        return kind === "ol" ? `<ol>${body}</ol>` : `<ul>${body}</ul>`;
    }

    function renderItem(kind: ListKind, item: AnytypeBlock): string {
        const text = renderInlineText(item.text?.text ?? "", item.text?.marks?.marks ?? []);
        const nested = renderSequence(item.childrenIds ?? []);
        if (kind === "task") {
            // CKEditor's read-only todo-list markup (matches the markdown importer's checkbox output).
            const checkbox = `<input type="checkbox"${item.text?.checked ? 'checked="checked" ' : ""}disabled="disabled">`;
            return `<li><label class="todo-list__label">${checkbox}<span class="todo-list__label__description">${text}</span></label>${nested}</li>`;
        }
        return `<li>${text}${nested}</li>`;
    }

    function renderLeaf(block: AnytypeBlock): string {
        // A divider block (Line or Dots) — both become a horizontal rule.
        if (block.div) {
            return "<hr>";
        }

        // A block-level "link to object" → a reference link to the imported target note. An unresolved
        // target (a set, or an object missing from the export) is dropped, along with its relation.
        if (block.link) {
            const target = block.link.targetBlockId ? resolveLink(block.link.targetBlockId) : undefined;
            if (!target) {
                return "";
            }
            linkTargetIds.add(target.noteId);
            return `<p><a class="reference-link" href="#root/${target.noteId}">${escapeHtml(target.title)}</a></p>`;
        }

        // Use the raw text (not trimmed) so mark offsets stay aligned; only the emptiness test trims.
        const rawText = block.text?.text ?? "";
        const style = block.text?.style;
        const marks = block.text?.marks?.marks ?? [];

        if (style === "Toggle") {
            // A normal toggle becomes a Trilium collapsible block: its label is the summary, its children
            // the collapsed body. (Toggle *headings* fall through to a normal heading below, via tagForStyle.)
            return `<details class="trilium-collapsible"><summary>${renderInlineText(rawText, marks)}</summary>${renderSequence(block.childrenIds ?? [])}</details>`;
        }

        if (style === "Quote") {
            // Anytype's Highlight block (internal style "Quote") → a blockquote; its background tint is dropped.
            const firstPara = rawText.trim() ? `<p>${renderInlineText(rawText, marks)}</p>` : "";
            return `<blockquote>${firstPara}${renderSequence(block.childrenIds ?? [])}</blockquote>`;
        }

        if (style === "Callout") {
            // A callout becomes a Trilium admonition. Following the Notion importer: the default icon (no
            // custom emoji) maps to a "tip" with the icon dropped; any custom emoji maps to a "note" with
            // the emoji kept at the start of the body (admonitions have no per-block icon).
            const emoji = block.text?.iconEmoji ?? "";
            const type = emoji ? "note" : "tip";
            const lead = [emoji, renderInlineText(rawText, marks)].filter(Boolean).join(" ");
            const firstPara = lead ? `<p>${lead}</p>` : "";
            return `<aside class="admonition ${type}">${firstPara}${renderSequence(block.childrenIds ?? [])}</aside>`;
        }

        let html = "";
        if (rawText.trim() && style !== "Title" && style !== "Description") {
            if (style === "Code") {
                // A code block is literal: no inline marks, and its language is preserved as the MIME.
                html = renderCodeBlock(rawText, block.fields?.lang);
            } else {
                const tag = tagForStyle(style);
                html = `<${tag}>${renderInlineText(rawText, marks)}</${tag}>`;
            }
        }
        // A non-list block's children (e.g. a toggle heading's collapsed content) follow as flattened siblings.
        return html + renderSequence(block.childrenIds ?? []);
    }

    // The root block is the page container and carries no text of its own — start from its children.
    const html = renderSequence(root.childrenIds ?? []);
    return { html, linkTargetIds: [...linkTargetIds] };
}

/** The kind of list a block belongs to (bullet/ordered/task), or null when it isn't a list item. */
type ListKind = "ul" | "ol" | "task";
function listKind(block: AnytypeBlock): ListKind | null {
    switch (block.text?.style) {
        case "Marked":
            return "ul";
        case "Numbered":
            return "ol";
        case "Checkbox":
            return "task";
        default:
            return null;
    }
}

/**
 * Maps an Anytype text-block style to the Trilium tag it becomes. Anytype's three in-body heading levels
 * (UI-labelled Title / Heading / Subheading) map to Trilium's top three heading levels: Trilium reserves
 * `<h1>` for the note title, so its body headings start at `<h2>`. Toggle headings collapse to the same
 * plain headings (their toggle nature is dropped). Every other non-list style (paragraphs, quotes,
 * callouts, …) is flattened to a paragraph for now.
 */
function tagForStyle(style: string | undefined): string {
    switch (style) {
        case "Header1":
        case "ToggleHeader1":
            return "h2";
        case "Header2":
        case "ToggleHeader2":
            return "h3";
        case "Header3":
        case "ToggleHeader3":
            return "h4";
        default:
            return "p";
    }
}

// #region Inline marks
const MARK_TAGS: Record<string, string> = {
    Bold: "strong",
    Italic: "em",
    Underscored: "u",
    Strikethrough: "s",
    Keyboard: "code"
};

// Anytype's system colour palette (`--color-tag-*` / `--color-bg-tag-*`); marks carry the name in `param`.
// Backgrounds are already opaque, so no flatten-over-white step is needed (unlike Notion's translucent set).
const TEXT_COLORS: Record<string, string> = {
    grey: "#8c9ea5", yellow: "#b2a616", orange: "#d3720d", red: "#e2400c", pink: "#ca1b8e",
    purple: "#9e30c4", blue: "#3e58eb", ice: "#1c8bca", teal: "#0caaa3", lime: "#64b90f"
};
const BG_COLORS: Record<string, string> = {
    grey: "#e3e3e3", yellow: "#f4eb91", orange: "#fcdc9c", red: "#fcd1c3", pink: "#f8c2e5",
    purple: "#e8d0f1", blue: "#cbd2fa", ice: "#b2dff9", teal: "#a9ebe6", lime: "#c5efa3"
};

// Anytype's default (light-theme) text colour. A highlight (background) without an explicit text colour is
// paired with this so the text stays readable on the pale highlight regardless of the Trilium theme —
// otherwise a dark theme's default white text would be invisible on it.
const DEFAULT_TEXT_COLOR = "#252525";

// Outer-to-inner nesting order for the structural marks that cover the same segment — fixed so output is
// deterministic. Colours are handled separately (folded into a single inner span).
const MARK_ORDER = ["Bold", "Italic", "Underscored", "Strikethrough", "Keyboard"];

interface AppliedMark {
    type: string;
    param: string;
    from: number;
    to: number;
}

/**
 * Converts a text block's inline marks into HTML. Anytype encodes formatting as a flat list of marks, each
 * a `[from, to)` character range (UTF-16 offsets) with a type — and marks may overlap freely. We turn that
 * into valid nested HTML by splitting the text at every mark boundary, so no segment straddles a mark edge,
 * then wrapping each segment in the tags whose range fully covers it. Adjacent segments always differ in
 * their active set (a boundary is only created where a mark starts or ends), so output is clean without a
 * merge pass. Links, mentions and emoji are ignored, leaving their text as plain (escaped) content.
 */
export function renderInlineText(text: string, marks: AnytypeMark[]): string {
    const length = text.length;

    // Keep only marks we render (known structural kind, or a known colour name), with offsets clamped to
    // the text and empty/reversed ranges dropped.
    const applicable: AppliedMark[] = [];
    for (const mark of marks) {
        const param = mark.param ?? "";
        if (mark.type === undefined || !isRenderable(mark.type, param)) {
            continue;
        }
        const from = Math.max(0, Math.min(length, mark.range?.from ?? 0));
        const to = Math.max(0, Math.min(length, mark.range?.to ?? 0));
        if (from < to) {
            applicable.push({ type: mark.type, param, from, to });
        }
    }

    if (applicable.length === 0) {
        return escapeHtml(text);
    }

    // Split at every mark boundary so each segment is uniformly covered (or not) by each mark.
    const boundaries = new Set<number>([0, length]);
    for (const mark of applicable) {
        boundaries.add(mark.from);
        boundaries.add(mark.to);
    }
    const points = [...boundaries].sort((a, b) => a - b);

    let html = "";
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        const covering = applicable.filter((mark) => mark.from <= start && mark.to >= end);
        html += wrapSegment(escapeHtml(text.slice(start, end)), covering);
    }

    return html;
}

/** Whether a mark is rendered: a known structural kind, or a colour with a known palette name. */
function isRenderable(type: string, param: string): boolean {
    if (type in MARK_TAGS) {
        return true;
    }
    if (type === "TextColor") {
        return param in TEXT_COLORS;
    }
    if (type === "BackgroundColor") {
        return param in BG_COLORS;
    }
    return false;
}

/**
 * Wraps one segment in the tags of the marks that fully cover it. Text and background colour fold into a
 * single innermost `<span>` (a highlight without a text colour gets the default dark text); the structural
 * marks then nest around it, Bold outermost per {@link MARK_ORDER}.
 */
function wrapSegment(segment: string, covering: AppliedMark[]): string {
    const textColor = paletteValue(covering, "TextColor", TEXT_COLORS);
    const bgColor = paletteValue(covering, "BackgroundColor", BG_COLORS);

    const styleParts: string[] = [];
    if (textColor) {
        styleParts.push(`color:${textColor}`);
    } else if (bgColor) {
        styleParts.push(`color:${DEFAULT_TEXT_COLOR}`);
    }
    if (bgColor) {
        styleParts.push(`background-color:${bgColor}`);
    }
    let html = styleParts.length > 0 ? `<span style="${styleParts.join(";")}">${segment}</span>` : segment;

    const structural = covering.filter((mark) => mark.type in MARK_TAGS).sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
    for (let i = structural.length - 1; i >= 0; i--) {
        const tag = MARK_TAGS[structural[i].type];
        html = `<${tag}>${html}</${tag}>`;
    }

    return html;
}

/** The palette value for the segment's mark of the given colour type, or undefined if none covers it. */
function paletteValue(covering: AppliedMark[], type: string, palette: Record<string, string>): string | undefined {
    const mark = covering.find((candidate) => candidate.type === type);
    return mark ? palette[mark.param] : undefined;
}
// #endregion

// #region Code blocks
// PrismJS language ids Anytype uses that don't line up with a Trilium markdown language code. Most ids
// (javascript, python, go, rust, …) match directly; only the mismatches need listing here. `clike` is
// PrismJS's generic C-family base, mapped to plain C as the closest concrete language.
const LANGUAGE_ALIASES: Record<string, string> = {
    clike: "c"
};

/**
 * Renders an Anytype `Code`-style block as a Trilium/CKEditor code block. Anytype tags the block with a
 * PrismJS language id in `fields.lang`; we map that to a Trilium MIME and emit it as the CKEditor
 * code-block language class (`language-<normalized-mime>`), the same shape the markdown importer produces.
 * Quotes are left literal (matching the markdown importer), and an unknown language falls back to
 * auto-detect.
 */
export function renderCodeBlock(text: string, lang: string | undefined): string {
    return `<pre><code class="language-${codeLanguage(lang)}">${escapeHtml(text).replace(/&quot;/g, '"')}</code></pre>`;
}

/** The CKEditor code-block language class value for an Anytype language id, or auto-detect when unknown. */
function codeLanguage(lang: string | undefined): string {
    if (lang) {
        const mimeDefinition = getMimeTypeFromMarkdownName(LANGUAGE_ALIASES[lang] ?? lang);
        if (mimeDefinition) {
            return normalizeMimeTypeForCKEditor(mimeDefinition.mime);
        }
    }
    return MIME_TYPE_AUTO;
}
// #endregion

/**
 * Creates a fresh "Anytype import" root and a flat child note per page. Each note is created with the id
 * pre-assigned in {@link importAnytype} (`targets`), so the reference links already baked into the content
 * point at the real notes. Once every page exists, each page's outgoing links are recorded as
 * `internalLink` relations, which Trilium uses for backlink detection ("what links here").
 */
function createNotes(importRootNote: BNote, pages: ParsedObject[], targets: Map<string, ResolvedLink>, taskContext: TaskContext<"importNotes">): BNote {
    /* v8 ignore next -- the protected branch needs a protected import root with an active protected session, which the in-memory test DB has no way to set up */
    const isProtected = importRootNote.isProtected && protectedSessionService.isProtectedSessionAvailable();

    const rootNote = noteService.createNewNote({ parentNoteId: importRootNote.noteId, title: t("anytype_import.root-title"), content: "", type: "text", mime: "text/html", isProtected }).note;
    rootNote.addLabel("iconClass", "bx bx-import");

    const notesByPageId = new Map<string, BNote>();
    for (const page of pages) {
        const { note } = noteService.createNewNote({ noteId: targets.get(page.id)?.noteId, parentNoteId: rootNote.noteId, title: page.title, content: page.content, type: "text", mime: "text/html", isProtected, utcDateCreated: page.dateCreated });

        // Restore the original timestamps (note creation stamps "modified" — and the blob — with now). A
        // date-less page is left untouched, keeping its import-time dates. When only one date is present we
        // fall back like the ENEX importer: modified defaults to created.
        if (page.dateCreated || page.dateModified) {
            const dateCreated = page.dateCreated ?? note.utcDateCreated;
            note.setDateCreatedAndModified(dateCreated, page.dateModified ?? dateCreated);
        }

        notesByPageId.set(page.id, note);
        taskContext.increaseProgressCount();
    }

    for (const page of pages) {
        const sourceNote = notesByPageId.get(page.id);
        for (const targetNoteId of page.linkTargetIds) {
            sourceNote?.addRelation("internalLink", targetNoteId);
        }
    }

    return rootNote;
}

// #region Export model
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

/** The text payload of a text block: its `text`, `style` (Paragraph, Header1, Marked, Checkbox, Callout, …),
 * a `marks.marks` list of inline formatting spans over `text`, and per-style extras (`checked`, `iconEmoji`). */
export interface AnytypeText {
    text?: string;
    style?: string;
    marks?: {
        marks?: AnytypeMark[];
    };
    /** Whether a `Checkbox`-style list item is ticked. */
    checked?: boolean;
    /** A `Callout`'s icon; empty for the default icon, otherwise a custom emoji. */
    iconEmoji?: string;
}

/** A single block in an object's `snapshot.data.blocks`. Non-text blocks (dividers, dataviews, …) carry
 * other keys this importer doesn't read yet; only `id`, `childrenIds`, `text`, `div`, `link` and (for code
 * blocks) `fields.lang` are needed to pull out the page's content in document order. */
export interface AnytypeBlock {
    id: string;
    childrenIds?: string[];
    text?: AnytypeText;
    /** Per-block extras. For a `Code`-style text block, `lang` holds the PrismJS language id. */
    fields?: {
        lang?: string;
    };
    /** A divider block (`style` is "Line" or "Dots"); both become a horizontal rule. */
    div?: {
        style?: string;
    };
    /** A block-level "link to object". `targetBlockId` is the linked object's id (CID); `style` is "Page"
     * for a page link. Rendered as a reference link to the imported target note. */
    link?: {
        targetBlockId?: string;
        style?: string;
    };
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
    /** Page creation time as a Unix timestamp in seconds. Omitted/`0` for system objects. */
    createdDate?: number;
    /** Page last-modification time as a Unix timestamp in seconds. */
    lastModifiedDate?: number;
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

/** A page parsed down to what the importer needs to create a Trilium note. */
export interface ParsedObject {
    /** The object's id (the root block's id); used later to resolve cross-object links. */
    id: string;
    title: string;
    /** Body HTML built from the page's blocks. */
    content: string;
    /** De-duplicated Trilium note ids this page links to, for recording `internalLink` relations. */
    linkTargetIds: string[];
    /** Creation time as a Trilium UTC datetime string (from Anytype's `createdDate`), if available. */
    dateCreated?: string;
    /** Last-modification time as a Trilium UTC datetime string (from `lastModifiedDate`), if available. */
    dateModified?: string;
}

/** The imported note a linked-to Anytype object resolved to: its Trilium id and (fallback) title. */
export interface ResolvedLink {
    noteId: string;
    title: string;
}

/** Resolves an Anytype object id (CID) to the Trilium note it was imported as, or undefined when the
 * target wasn't imported (a set/collection, or an object missing from the export). */
export type LinkResolver = (targetCid: string) => ResolvedLink | undefined;
// #endregion

export default { importAnytype };
