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
 * backlinks resolve). Each page keeps its original creation and modification timestamps.
 *
 * Collections and their properties are handled in {@link ./collection.js}: a collection becomes a `book`
 * with a `table` view whose columns are promoted-attribute definitions, its members nest beneath it, and an
 * object's custom relations become labels / file attachments. Pages without a collection land as flat
 * children of a fresh "Anytype import" root. Types and templates are still deferred.
 *
 * Invoked from the shared file-import dispatcher (routes/api/import.ts) when the upload is tagged
 * `format=anytype`, so progress, completion and failure are reported by that dispatcher's TaskContext —
 * this service just builds the tree and returns its root note, like the zip/notion importers.
 */

import { t } from "i18next";

import type BNote from "../../../becca/entities/bnote.js";
import cloningService from "../../cloning.js";
import noteService from "../../notes.js";
import protectedSessionService from "../../protected_session.js";
import type TaskContext from "../../task_context.js";
import date_utils from "../../utils/date.js";
import { newEntityId } from "../../utils/index.js";
import { basename } from "../../utils/path.js";
import { getZipProvider } from "../../zip_provider.js";
import { applyFiles, applyProperties, applyTableView, buildFileObjectMap, buildOptionMap, buildRelationMap, createCollectionNote, normalizePath, parseCollection, parseFiles, parseProperties, synthesizeColumns } from "./collection.js";
import { extractContent } from "./content.js";
import type { AnytypeDetails, AnytypeSnapshot, FileObjectInfo, LinkResolver, ParsedColumn, ParsedObject, RelationInfo, ResolvedLink } from "./model.js";

async function importAnytype(taskContext: TaskContext<"importNotes">, fileBuffer: Uint8Array, importRootNote: BNote, fileName?: string): Promise<BNote> {
    const { objects, relations, options, fileObjects, files } = await parseZip(fileBuffer);
    const relationMap = buildRelationMap(relations);
    const optionMap = buildOptionMap(options);
    const fileObjectMap = buildFileObjectMap(fileObjects);
    // Import basic pages and collections (a collection carries the collection layout, so isPage rejects it);
    // query sets and system objects stay out.
    const pageSnapshots = objects.filter((snapshot) => isPage(snapshot) || isCollectionObject(snapshot));

    // A collection-scoped export omits the collection itself (Anytype doesn't export the wrapper), so its
    // name and column schema are lost. Recover them: name the import root from the zip and make it a `table`
    // collection whose columns are synthesized from the properties its member pages carry.
    const objectIds = new Set(objects.map((snapshot) => snapshot.snapshot?.data?.details?.id).filter((id): id is string => !!id));
    const collectionExport = !!fileName && isSingleCollectionExport(pageSnapshots, objectIds);
    const rootTitle = collectionExport && fileName ? collectionTitleFromFileName(fileName) : undefined;
    const rootColumns = collectionExport ? synthesizeColumns(pageSnapshots.map((snapshot) => snapshot.snapshot?.data?.details ?? {}), relationMap) : undefined;

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

    const pages = pageSnapshots.map((snapshot) => parseObject(snapshot, resolveLink, relationMap, optionMap));
    taskContext.setTotalCount(pages.length);

    return createNotes(importRootNote, pages, targets, fileObjectMap, files, rootTitle, rootColumns, taskContext);
}

/**
 * Reads the export's `objects/*.pb.json` (page/collection snapshots), `relations/*.pb.json` (property
 * definitions), `relationsOptions/*.pb.json` (select / multi-select option values), `filesObjects/*.pb.json`
 * (file metadata) and the raw bytes under `files/` (keyed by normalized path). The relation definitions name
 * and type the custom properties; the options resolve a select value's option id to its name; the file
 * objects + bytes back the file properties. Other sibling folders (types, templates, …) and the protobuf
 * `.pb` files are ignored for now. A malformed entry is skipped rather than failing the import.
 */
async function parseZip(fileBuffer: Uint8Array): Promise<{ objects: AnytypeSnapshot[]; relations: AnytypeSnapshot[]; options: AnytypeSnapshot[]; fileObjects: AnytypeSnapshot[]; files: Map<string, Uint8Array> }> {
    const provider = getZipProvider();
    const objects: AnytypeSnapshot[] = [];
    const relations: AnytypeSnapshot[] = [];
    const options: AnytypeSnapshot[] = [];
    const fileObjects: AnytypeSnapshot[] = [];
    const files = new Map<string, Uint8Array>();
    const filenameEncoding = await provider.detectFilenameEncoding(fileBuffer);

    await provider.readZipFile(fileBuffer, async (entry, readContent) => {
        // Raw bytes under files/ are kept as-is (they back file-property attachments), not parsed as JSON.
        if (isFileEntry(entry.fileName)) {
            files.set(normalizePath(entry.fileName), await readContent());
            return;
        }
        const bucket = isObjectEntry(entry.fileName) ? objects
            : isRelationOptionEntry(entry.fileName) ? options
                : isFileObjectEntry(entry.fileName) ? fileObjects
                    : isRelationEntry(entry.fileName) ? relations : undefined;
        if (!bucket) {
            return;
        }
        try {
            bucket.push(JSON.parse(new TextDecoder().decode(await readContent())) as AnytypeSnapshot);
        } catch {
            // A non-JSON or truncated entry isn't something we can import — skip it.
        }
    }, filenameEncoding);

    return { objects, relations, options, fileObjects, files };
}

/** True for entries that are JSON object files under the export's `objects/` folder. */
function isObjectEntry(fileName: string): boolean {
    return isJsonEntryUnder(fileName, "objects/");
}

/** True for entries that are JSON relation-definition files under the export's `relations/` folder. */
function isRelationEntry(fileName: string): boolean {
    return isJsonEntryUnder(fileName, "relations/");
}

/** True for entries that are JSON option files under the export's `relationsOptions/` folder. */
function isRelationOptionEntry(fileName: string): boolean {
    return isJsonEntryUnder(fileName, "relationsoptions/");
}

/** True for entries that are JSON file-metadata files under the export's `filesObjects/` folder. */
function isFileObjectEntry(fileName: string): boolean {
    return isJsonEntryUnder(fileName, "filesobjects/");
}

/** True for entries that are raw files under the export's `files/` folder (the bytes a file property links). */
function isFileEntry(fileName: string): boolean {
    return normalizePath(fileName).startsWith("files/");
}

function isJsonEntryUnder(fileName: string, folder: string): boolean {
    const normalized = normalizePath(fileName);
    return normalized.startsWith(folder) && normalized.endsWith(".pb.json");
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
 * Whether a snapshot is a collection — a `Page` smartblock with a dataview block flagged `isCollection`.
 * A collection's `resolvedLayout` is the collection layout (14), not the basic 0, so {@link isPage} excludes
 * it; it's admitted by this flag instead. Query *sets* (a dataview with `isCollection` false) stay excluded.
 */
export function isCollectionObject(snapshot: AnytypeSnapshot): boolean {
    if (snapshot.sbType !== "Page") {
        return false;
    }
    return (snapshot.snapshot?.data?.blocks ?? []).some((block) => block.dataview?.isCollection);
}

/**
 * Whether the export is a single collection's contents. Exporting just a collection (rather than the whole
 * space) omits the collection object itself, so its name is lost and only its member objects ship — each
 * created inside the same (now absent) collection. So: every imported page shares one `createdInContext` id
 * that isn't itself present in the export. A regular export fails this (pages have varied or no context, and
 * a full export keeps the collection wrapper). When true, the import root is named from the zip instead.
 */
export function isSingleCollectionExport(pageSnapshots: AnytypeSnapshot[], objectIds: Set<string>): boolean {
    if (pageSnapshots.length === 0) {
        return false;
    }
    const context = pageSnapshots[0].snapshot?.data?.details?.createdInContext;
    if (!context || objectIds.has(context)) {
        return false;
    }
    return pageSnapshots.every((snapshot) => snapshot.snapshot?.data?.details?.createdInContext === context);
}

/** The import-root title for a collection-scoped export: the export file's base name without its extension. */
export function collectionTitleFromFileName(fileName: string): string {
    const base = basename(fileName.replace(/\\/g, "/"));
    return base.replace(/\.[^.]+$/, "").trim() || base;
}

/**
 * Reduces a page snapshot to the title, body HTML, outgoing link targets, property values and (for a
 * collection) its table schema and membership. `resolveLink` maps a linked object's id to the Trilium note
 * it became; without one (parsing a page in isolation) link blocks are dropped. `relations` names and types
 * the custom properties; without it (or for system fields) properties are skipped.
 */
export function parseObject(snapshot: AnytypeSnapshot, resolveLink: LinkResolver = () => undefined, relations: Map<string, RelationInfo> = new Map(), options: Map<string, string> = new Map()): ParsedObject {
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
        dateModified: anytypeDate(details.lastModifiedDate),
        properties: parseProperties(details, relations, options),
        fileRefs: parseFiles(details, relations),
        collection: parseCollection(data?.blocks ?? [], details, relations)
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
 * Creates a fresh "Anytype import" root and the page notes beneath it. A collection becomes a `book` with a
 * `table` view and one promoted-attribute definition per column; a regular page becomes a `text` note. Each
 * note is created with the id pre-assigned in {@link importAnytype} (`targets`), so the reference links
 * already baked into the content point at the real notes, and carries its own property values as labels. A
 * collection's members are parented under it (their first collection) — a member in further collections is
 * cloned into each. File-property values become `role:"file"` attachments with a reference link prepended to
 * the body. Once every page exists, each page's outgoing links are recorded as `internalLink` relations,
 * which Trilium uses for backlink detection ("what links here").
 */
function createNotes(importRootNote: BNote, pages: ParsedObject[], targets: Map<string, ResolvedLink>, fileObjects: Map<string, FileObjectInfo>, files: Map<string, Uint8Array>, rootTitle: string | undefined, rootColumns: ParsedColumn[] | undefined, taskContext: TaskContext<"importNotes">): BNote {
    /* v8 ignore next -- the protected branch needs a protected import root with an active protected session, which the in-memory test DB has no way to set up */
    const isProtected = importRootNote.isProtected && protectedSessionService.isProtectedSessionAvailable();

    // A collection-scoped export's root *is* the collection: a `table`-view book carrying the synthesized
    // columns, with the member pages as its rows. A normal export's root is a plain container.
    const title = rootTitle ?? t("anytype_import.root-title");
    const rootNote = rootColumns
        ? noteService.createNewNote({ parentNoteId: importRootNote.noteId, title, content: "", type: "book", mime: "", isProtected }).note
        : noteService.createNewNote({ parentNoteId: importRootNote.noteId, title, content: "", type: "text", mime: "text/html", isProtected }).note;
    if (rootColumns) {
        applyTableView(rootNote, rootColumns);
    }
    rootNote.addLabel("iconClass", "bx bx-import");

    // Each member's primary parent is the first collection that lists it (a collection itself stays at the
    // root, so it's never reparented — it's cloned into an owning collection by the membership pass below).
    const collectionPageIds = new Set(pages.filter((page) => page.collection).map((page) => page.id));
    const primaryCollectionByMember = new Map<string, string>();
    for (const page of pages) {
        for (const memberId of page.collection?.memberIds ?? []) {
            if (!collectionPageIds.has(memberId) && !primaryCollectionByMember.has(memberId)) {
                primaryCollectionByMember.set(memberId, page.id);
            }
        }
    }

    // Create collections before regular pages so a member can be parented under its collection.
    const notesByPageId = new Map<string, BNote>();
    const ordered = [...pages].sort((a, b) => (a.collection ? 0 : 1) - (b.collection ? 0 : 1));
    for (const page of ordered) {
        const noteId = targets.get(page.id)?.noteId;
        let note: BNote;
        if (page.collection) {
            note = createCollectionNote(rootNote.noteId, page, page.collection, noteId, isProtected);
        } else {
            const primaryCollectionId = primaryCollectionByMember.get(page.id);
            const parentNoteId = (primaryCollectionId ? notesByPageId.get(primaryCollectionId)?.noteId : undefined) ?? rootNote.noteId;
            ({ note } = noteService.createNewNote({ noteId, parentNoteId, title: page.title, content: page.content, type: "text", mime: "text/html", isProtected, utcDateCreated: page.dateCreated }));
        }

        applyProperties(note, page.properties);
        applyFiles(note, page, fileObjects, files);
        applyDates(note, page);
        notesByPageId.set(page.id, note);
        taskContext.increaseProgressCount();
    }

    // Membership: clone a member into every collection that isn't already its (primary) parent.
    for (const page of pages) {
        const collectionNote = page.collection ? notesByPageId.get(page.id) : undefined;
        for (const memberId of page.collection?.memberIds ?? []) {
            if (primaryCollectionByMember.get(memberId) === page.id) {
                continue;
            }
            const memberNote = notesByPageId.get(memberId);
            if (memberNote && collectionNote) {
                cloningService.cloneNoteToParentNote(memberNote.noteId, collectionNote.noteId);
            }
        }
    }

    for (const page of pages) {
        const sourceNote = notesByPageId.get(page.id);
        for (const targetNoteId of page.linkTargetIds) {
            sourceNote?.addRelation("internalLink", targetNoteId);
        }
    }

    return rootNote;
}

/**
 * Restores a page's original timestamps (note creation stamps "modified" — and the blob — with now). A
 * date-less page is left untouched, keeping its import-time dates. When only one date is present we fall back
 * like the ENEX importer: modified defaults to created.
 */
function applyDates(note: BNote, page: ParsedObject) {
    if (page.dateCreated || page.dateModified) {
        const dateCreated = page.dateCreated ?? note.utcDateCreated;
        note.setDateCreatedAndModified(dateCreated, page.dateModified ?? dateCreated);
    }
}

export default { importAnytype };
