/**
 * Anytype collection & property handling: turns a collection's dataview into a Trilium table and an object's
 * custom relations into attributes/attachments.
 *
 * An Anytype collection is a `Page` whose dataview is flagged `isCollection`; its columns are the visible
 * relations of its first view and its members are `details.links`. This module reads the supporting metadata
 * — relation definitions ({@link buildRelationMap}), select/multi-select options ({@link buildOptionMap}) and
 * file objects ({@link buildFileObjectMap}) — then parses each object's property values
 * ({@link parseProperties}), file references ({@link parseFiles}) and collection schema
 * ({@link parseCollection}), and applies them to notes: a collection container ({@link createCollectionNote}),
 * a row's labels ({@link applyProperties}) and its file attachments ({@link applyFiles}). The structure
 * importer (importer.ts) owns page parsing and the note tree; it calls into here. Mirrors the Notion
 * importer's `collection.ts`.
 */

import { dayjs } from "@triliumnext/commons";

import type BNote from "../../../becca/entities/bnote.js";
import noteService from "../../notes.js";
import { basename } from "../../utils/path.js";
import { applyUrlScheme, attachmentReferenceLink, buildPromotedDefinition, saveFileAttachment, toAttributeName } from "../collection_utils.js";
import type { AnytypeBlock, AnytypeDetails, AnytypeSnapshot, FileObjectInfo, Multiplicity, ParsedCollection, ParsedColumn, ParsedObject, ParsedProperty, PropertyLabelType, RelationInfo } from "./model.js";

/** Normalizes a zip entry / file path to forward slashes and lower case (Windows exports use backslashes),
 * so a file property's `source` matches the key its bytes were stored under. */
export function normalizePath(fileName: string): string {
    return fileName.replace(/\\/g, "/").toLowerCase();
}

/** Indexes the relation definitions by their `relationKey` (the key under which objects carry the value). */
export function buildRelationMap(relations: AnytypeSnapshot[]): Map<string, RelationInfo> {
    const map = new Map<string, RelationInfo>();
    for (const snapshot of relations) {
        const details = snapshot.snapshot?.data?.details;
        if (details?.relationKey) {
            map.set(details.relationKey, { name: details.name ?? "", format: details.relationFormat ?? -1, includeTime: !!details.relationFormatIncludeTime });
        }
    }
    return map;
}

/** Indexes the select / multi-select option values by id, so an object's stored option id resolves to its name. */
export function buildOptionMap(options: AnytypeSnapshot[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const snapshot of options) {
        const details = snapshot.snapshot?.data?.details;
        if (details?.id) {
            map.set(details.id, details.name ?? "");
        }
    }
    return map;
}

/** Indexes the file objects by id, resolving each to the title, MIME and bytes-path a file property needs. */
export function buildFileObjectMap(fileObjects: AnytypeSnapshot[]): Map<string, FileObjectInfo> {
    const map = new Map<string, FileObjectInfo>();
    for (const snapshot of fileObjects) {
        const details = snapshot.snapshot?.data?.details;
        if (!details?.id) {
            continue;
        }
        const source = details.source ?? "";
        // The attachment title is the file's name: the source's base name, or the name + extension.
        const title = basename(normalizePath(source)) || `${details.name ?? "file"}${details.fileExt ? `.${details.fileExt}` : ""}`;
        map.set(details.id, { title, mime: details.fileMimeType ?? "", source });
    }
    return map;
}

/** The Anytype relation format for a file/object value — handled as an attachment, not a label/column. */
const FILE_FORMAT = 5;

/**
 * Maps an Anytype relation to how its values import, or undefined for a format not yet supported (file, …).
 * Date and date-time share format 4, told apart by the relation's `includeTime` flag; email and phone reuse
 * the `url` type with a `mailto:`/`tel:` scheme. Select and multi-select are `optionBacked` (their value is
 * a list of option ids resolved to names) and follow the Notion importer's single/multi text mapping.
 */
function propertyMapping(info: RelationInfo): PropertyMapping | undefined {
    switch (info.format) {
        case 0: // longtext
        case 1: // shorttext
            return { labelType: "text", multiplicity: "single" };
        case 2: // number
            return { labelType: "number", multiplicity: "single" };
        case 3: // status / single-select
            return { labelType: "text", multiplicity: "single", optionBacked: true };
        case 4: // date / date-time
            return { labelType: info.includeTime ? "datetime" : "date", multiplicity: "single" };
        case 6: // checkbox
            return { labelType: "boolean", multiplicity: "single" };
        case 7: // url
            return { labelType: "url", multiplicity: "single" };
        case 8: // email
            return { labelType: "url", scheme: "mailto:", multiplicity: "single" };
        case 9: // phone
            return { labelType: "url", scheme: "tel:", multiplicity: "single" };
        case 11: // tag / multi-select
            return { labelType: "text", multiplicity: "multi", optionBacked: true };
        default:
            return undefined;
    }
}

/** A custom (user-defined) relation key is a hex id; system relations (name, type, createdDate, …) are
 * plain words, and must not be imported as properties. */
function isCustomRelationKey(key: string): boolean {
    return /^[0-9a-f]{16,}$/.test(key);
}

/**
 * Reads an object's custom property values as `{ attributeName, value }` pairs. Only the supported formats
 * (see {@link propertyMapping}) of user-defined relations are taken; unset values are dropped, and email /
 * phone values gain a `mailto:`/`tel:` scheme so they stay clickable as url labels. A select / multi-select
 * value is a list of option ids, each resolved to its display name via `options` (a multi-select yields one
 * label per option; an unresolvable option is skipped).
 */
export function parseProperties(details: AnytypeDetails, relations: Map<string, RelationInfo>, options: Map<string, string>): ParsedProperty[] {
    const properties: ParsedProperty[] = [];
    for (const [key, raw] of Object.entries(details as Record<string, unknown>)) {
        if (!isCustomRelationKey(key)) {
            continue;
        }
        const info = relations.get(key);
        const mapping = info ? propertyMapping(info) : undefined;
        if (!info || !mapping) {
            continue;
        }
        const name = toAttributeName(info.name);
        if (mapping.optionBacked) {
            for (const optionId of Array.isArray(raw) ? raw : []) {
                const optionName = typeof optionId === "string" ? options.get(optionId) : undefined;
                if (optionName && optionName.trim()) {
                    properties.push({ name, value: optionName });
                }
            }
        } else {
            const value = formatPropertyValue(raw, mapping.labelType, mapping.scheme);
            if (value !== undefined) {
                properties.push({ name, value });
            }
        }
    }
    return properties;
}

/**
 * Reads an object's file-property values as a flat list of file-object ids (a file relation's value is a
 * list of `FileObject` ids). They become `role:"file"` attachments at import time (see {@link applyFiles}),
 * not labels — the same as the Notion importer — so they're collected separately from {@link parseProperties}.
 */
export function parseFiles(details: AnytypeDetails, relations: Map<string, RelationInfo>): string[] {
    const refs: string[] = [];
    for (const [key, raw] of Object.entries(details as Record<string, unknown>)) {
        if (!isCustomRelationKey(key) || relations.get(key)?.format !== FILE_FORMAT) {
            continue;
        }
        for (const fileId of Array.isArray(raw) ? raw : []) {
            if (typeof fileId === "string") {
                refs.push(fileId);
            }
        }
    }
    return refs;
}

/**
 * Reads a collection's table schema and membership, or undefined when the page isn't a collection. The
 * members are its `details.links`; the columns are the *visible*, supported, custom relations of its first
 * dataview view, in their stored order, de-duplicated by attribute name.
 */
export function parseCollection(blocks: AnytypeBlock[], details: AnytypeDetails, relations: Map<string, RelationInfo>): ParsedCollection | undefined {
    const dataview = blocks.find((block) => block.dataview)?.dataview;
    if (!dataview?.isCollection) {
        return undefined;
    }

    const visibleKeys = (dataview.views?.[0]?.relations ?? []).filter((relation) => relation.isVisible).map((relation) => relation.key);
    return { memberIds: details.links ?? [], columns: columnsFromKeys(visibleKeys, relations) };
}

/**
 * Synthesizes a table schema for a collection-scoped export, whose collection wrapper (and therefore its
 * view) wasn't exported — so there's no column list. The columns are the union of the supported custom
 * relations actually carried by the member objects, in first-seen order, de-duplicated by attribute name.
 */
export function synthesizeColumns(memberDetails: AnytypeDetails[], relations: Map<string, RelationInfo>): ParsedColumn[] {
    return columnsFromKeys(memberDetails.flatMap((details) => Object.keys(details)), relations);
}

/** Maps a list of relation keys to their (supported, custom) table columns, in order, de-duplicated by name. */
function columnsFromKeys(keys: (string | undefined)[], relations: Map<string, RelationInfo>): ParsedColumn[] {
    const columns: ParsedColumn[] = [];
    const seen = new Set<string>();
    for (const key of keys) {
        if (!key || !isCustomRelationKey(key)) {
            continue;
        }
        const info = relations.get(key);
        const mapping = info ? propertyMapping(info) : undefined;
        if (!info || !mapping) {
            continue;
        }
        const name = toAttributeName(info.name);
        if (!seen.has(name)) {
            seen.add(name);
            columns.push({ name, labelType: mapping.labelType, alias: info.name, multiplicity: mapping.multiplicity });
        }
    }
    return columns;
}

/**
 * Converts a property value to its Trilium label string, or undefined when it should be dropped. A boolean
 * becomes `"true"`/`"false"`; a date (Anytype stores an epoch in *seconds*) becomes a local `YYYY-MM-DD` or
 * `YYYY-MM-DDTHH:mm` string the promoted date/datetime inputs round-trip; a number is stringified (a
 * non-numeric value rejected); a text/url value is trimmed-checked for emptiness; an email/phone value is
 * given its `mailto:`/`tel:` scheme unless it already carries one.
 */
function formatPropertyValue(raw: unknown, labelType: PropertyLabelType, scheme: string | undefined): string | undefined {
    if (raw === null || raw === undefined) {
        return undefined;
    }
    if (labelType === "boolean") {
        if (raw === true || raw === "true") {
            return "true";
        }
        return raw === false || raw === "false" ? "false" : undefined;
    }
    if (labelType === "date" || labelType === "datetime") {
        const seconds = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(seconds)) {
            return undefined;
        }
        // Anytype stores the instant; format it in local time (like the Notion importer) so the date/time
        // matches the wall-clock the user saw in Anytype, in the format the promoted date/datetime inputs use.
        const local = dayjs(new Date(seconds * 1000));
        return labelType === "datetime" ? local.format("YYYY-MM-DD[T]HH:mm") : local.format("YYYY-MM-DD");
    }
    if (labelType === "number") {
        const num = typeof raw === "number" ? raw : Number(String(raw));
        return Number.isFinite(num) ? String(num) : undefined;
    }
    const value = typeof raw === "string" ? raw : String(raw);
    if (!value.trim()) {
        return undefined;
    }
    return scheme ? applyUrlScheme(value, scheme) : value;
}

/**
 * Creates a collection's container note: an empty `book` with a `table` view whose columns are the
 * collection's supported properties, each an *inheritable* promoted-attribute definition (so the table
 * renders the column and every member row inherits the field, showing its own value or blank). Mirrors the
 * Notion importer's database mapping.
 */
export function createCollectionNote(parentNoteId: string, page: ParsedObject, collection: ParsedCollection, noteId: string | undefined, isProtected: boolean | undefined): BNote {
    const { note } = noteService.createNewNote({ noteId, parentNoteId, title: page.title, content: "", type: "book", mime: "", isProtected, utcDateCreated: page.dateCreated });
    applyTableView(note, collection.columns);
    return note;
}

/**
 * Turns `note` into a `table`-view collection whose columns are the given properties, each an *inheritable*
 * promoted-attribute definition (so the table renders the column and every child row inherits the field,
 * showing its own value or blank). Used for both an imported collection and a collection-scoped export's root.
 */
export function applyTableView(note: BNote, columns: ParsedColumn[]) {
    note.addLabel("viewType", "table");

    // Increasing positions keep the columns in their stored order (the promoted-attributes UI sorts by
    // position, and equal positions aren't ordered deterministically).
    let position = 0;
    for (const column of columns) {
        position += 10;
        note.addAttribute("label", `label:${column.name}`, buildPromotedDefinition({ alias: column.alias, labelType: column.labelType, multiplicity: column.multiplicity }), true, position);
    }
}

/** Applies a page's custom property values to its note as labels. */
export function applyProperties(note: BNote, properties: ParsedProperty[]) {
    for (const property of properties) {
        note.addLabel(property.name, property.value);
    }
}

/**
 * Saves each of a page's file-property files as a `role:"file"` attachment and prepends a reference link to
 * the body — the same as the Notion importer, so the files are reachable from the note's content as well as
 * its attachments list. A file object missing from the export (no metadata, or bytes absent) is skipped.
 */
export function applyFiles(note: BNote, page: ParsedObject, fileObjects: Map<string, FileObjectInfo>, files: Map<string, Uint8Array>) {
    const fileLinks: string[] = [];
    for (const fileId of page.fileRefs) {
        const info = fileObjects.get(fileId);
        const bytes = info ? files.get(normalizePath(info.source)) : undefined;
        if (!info || !bytes) {
            continue;
        }
        const attachment = saveFileAttachment(note, info.title, bytes, info.mime);
        if (attachment.attachmentId) {
            fileLinks.push(`<p>${attachmentReferenceLink(note.noteId, attachment.attachmentId, info.title)}</p>`);
        }
    }

    if (fileLinks.length > 0) {
        // The note already holds its body (page content, or "" for a collection); prepend the file links.
        note.setContent(fileLinks.join("") + (page.collection ? "" : page.content));
    }
}

/** How a relation's values import: its Trilium label type, value count, an optional clickable scheme
 * (email/phone), and whether the value is option-backed (a select / multi-select, resolved via the options
 * map). Internal to {@link propertyMapping}; the shared `Parsed*` shapes live in {@link ./model.js}. */
interface PropertyMapping {
    labelType: PropertyLabelType;
    multiplicity: Multiplicity;
    scheme?: string;
    optionBacked?: boolean;
}
