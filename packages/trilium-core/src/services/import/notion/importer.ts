/**
 * Imports a Notion HTML-export zip into a Trilium note tree.
 *
 * Notion exports each page as `Page Title <id>.html`; a page that has children also gets a sibling
 * folder `Page Title <id>/` holding those children. Internal links and attachments reference the same
 * id-suffixed names. This first iteration reconstructs only the *structure* — the page hierarchy, titles
 * and original timestamps — copying each page's body HTML across roughly as-is. Faithful HTML cleanup,
 * link rewriting, images/attachments and database (CSV) handling are deliberately deferred.
 *
 * Invoked from the shared file-import dispatcher (routes/api/import.ts) when the upload is tagged
 * `format=notion`, so progress, completion and failure are reported by that dispatcher's TaskContext —
 * this service just builds the tree and returns its root note, like the zip/enex importers.
 */

import { dayjs, type LabelType, type Multiplicity } from "@triliumnext/commons";
import { t } from "i18next";
import { HTMLElement, parse } from "node-html-parser";

import type BNote from "../../../becca/entities/bnote.js";
import imageService from "../../image.js";
import noteService from "../../notes.js";
import protectedSessionService from "../../protected_session.js";
import { sanitizeHtml } from "../../sanitizer.js";
import type TaskContext from "../../task_context.js";
import dateUtils from "../../utils/date.js";
import { sanitizeAttributeName } from "../../utils/index.js";
import { getZipProvider } from "../../zip_provider.js";
import mimeService from "../mime.js";
import { convertNotionHtml } from "./converter.js";
import { getNotionId, stripNotionId } from "./notion_id.js";

/** A database column value lifted from a page's Notion properties table, destined for a Trilium attribute. */
interface NotionProperty {
    /** The column name, taken verbatim from the property row's `<th>` (sanitized only when made an attribute). */
    name: string;
    /** A label's final value, or — for a relation — the target page's Notion id (resolved to a note on import). */
    value: string;
    /** Trilium promoted-attribute type for a label column; omitted for a relation (it has no value type). */
    labelType?: LabelType;
    /** Whether the column holds one value or many (e.g. multi-select); sets the definition's multiplicity. */
    multiplicity: Multiplicity;
    /**
     * For a relation column, `value` is a target Notion id mapped to a `~relation` in the second pass; for a
     * file column, `value` is a zip-relative href saved as a `role:"file"` attachment. A plain label has neither.
     */
    kind?: "relation" | "file";
}

interface ParsedPage {
    /** The page's own Notion id, used to resolve cross-page links pointing at it. */
    id: string;
    title: string;
    /** Path of the .html entry inside the zip; drives both image resolution and folder-based parenting. */
    path: string;
    /** The page's body HTML, sanitized; empty when the body could not be located. */
    content: string;
    /** Database properties from the page's Notion properties table, mapped to Trilium labels on import. */
    properties: NotionProperty[];
    utcDateCreated?: string;
    utcDateModified?: string;
}

async function importNotion(taskContext: TaskContext<"importNotes">, fileBuffer: Uint8Array, importRootNote: BNote): Promise<BNote> {
    const { pages, resources, csvPaths, csvColumnsByFolder } = await parseZip(fileBuffer);
    addDatabaseContainers(pages, csvPaths);
    reconcileDateColumns(pages);
    taskContext.setTotalCount(pages.length);

    return createNotes(importRootNote, pages, resources, taskContext, csvColumnsByFolder);
}

/**
 * A Notion inline/linked database exports as a `<Name> <id>.csv` with no matching `.html` page, while its
 * rows are `.html` files in a sibling `<Name>/` folder — so nothing owns that folder and the rows would
 * orphan to the import root. Synthesize an (empty) container page for each such database, named after it,
 * so its rows nest under it. A database that also has its own page is left to that page (no duplicate).
 */
function addDatabaseContainers(pages: ParsedPage[], csvPaths: string[]) {
    const owned = new Set(pages.map((page) => ownedFolderKey(page.path)));
    for (const csvPath of csvPaths) {
        const key = ownedFolderKey(csvPath);
        if (owned.has(key)) {
            continue;
        }
        owned.add(key);
        pages.push({
            id: getNotionId(baseName(csvPath)) ?? "",
            title: stripNotionId(removeExtension(baseName(csvPath))) || "Database",
            path: csvPath,
            content: "",
            properties: []
        });
    }
}

/**
 * Reads the zip: HTML entries become parsed pages; every other file (images, attachments) is kept by its
 * normalized path so page content can later reference it. The `index.html` summary is skipped.
 *
 * A Notion workspace export wraps its content in a nested zip at the archive root — the part you'd
 * otherwise have to extract by hand — so root-level `.zip` entries are descended into. A zip nested inside
 * a folder is a user's attachment and kept as-is. Recursion is depth-bounded against pathological archives.
 */
const MAX_NESTED_ZIP_DEPTH = 2;

async function parseZip(fileBuffer: Uint8Array): Promise<{ pages: ParsedPage[]; resources: Map<string, Uint8Array>; csvPaths: string[]; csvColumnsByFolder: Map<string, string[]> }> {
    const provider = getZipProvider();
    const pages: ParsedPage[] = [];
    const resources = new Map<string, Uint8Array>();
    const csvPaths: string[] = [];
    // Database folder key → its columns (sanitized), in the CSV export's order — the authoritative column order.
    const csvColumnsByFolder = new Map<string, string[]>();

    const readArchive = async (buffer: Uint8Array, depth: number): Promise<void> => {
        const filenameEncoding = await provider.detectFilenameEncoding(buffer);
        await provider.readZipFile(buffer, async (entry, readContent) => {
            const path = entry.fileName;
            if (isDirectory(path)) {
                return;
            }
            if (path.toLowerCase().endsWith(".zip") && !path.includes("/")) {
                if (depth < MAX_NESTED_ZIP_DEPTH) {
                    await readArchive(await readContent(), depth + 1);
                }
            } else if (path.toLowerCase().endsWith(".html")) {
                if (baseName(path) === "index.html") {
                    return;
                }
                const parsed = parsePage(path, new TextDecoder().decode(await readContent()));
                if (parsed) {
                    pages.push(parsed);
                }
            } else if (path.toLowerCase().endsWith(".csv")) {
                // A Notion database exports as a CSV: its path reconstructs the hierarchy (a database with no
                // own page), and its header row lists every column in the database's order.
                csvPaths.push(path);
                const columns = parseCsvHeader(new TextDecoder().decode(await readContent()));
                csvColumnsByFolder.set(ownedFolderKey(path), columns.map((column) => sanitizeAttributeName(column)));
            } else {
                resources.set(normalizePath(path), await readContent());
            }
        }, filenameEncoding);
    };

    await readArchive(fileBuffer, 0);

    return { pages, resources, csvPaths, csvColumnsByFolder };
}

/**
 * Parses the column names from a CSV export's header row, handling double-quoted fields (which may contain
 * commas or escaped `""` quotes) and a leading UTF-8 BOM. Only the header row is needed for column order.
 */
function parseCsvHeader(content: string): string[] {
    const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    const header = text.split(/\r?\n/, 1)[0] ?? "";
    const columns: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < header.length; i++) {
        const char = header[i];
        if (inQuotes) {
            if (char === '"' && header[i + 1] === '"') {
                current += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                current += char;
            }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === ",") {
            columns.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    columns.push(current);

    return columns;
}

function parsePage(path: string, html: string): ParsedPage | null {
    const root = parse(html);

    // The page's own id is on the top-level element inside <body> (Notion gives it `id="<uuid>"`);
    // fall back to the id suffix on the filename so a structurally-odd page still lands somewhere.
    const body = root.querySelector("body");
    const id = firstChildNotionId(body) ?? getNotionId(baseName(path));
    if (!id) {
        return null;
    }

    const title = root.querySelector("title")?.textContent?.trim() || stripNotionId(removeExtension(baseName(path))) || "Untitled";

    const pageBody = root.querySelector(".page-body");
    const content = pageBody ? sanitizeHtml(convertNotionHtml(pageBody.innerHTML)) : "";

    return {
        id,
        title,
        path,
        content,
        properties: extractProperties(root),
        utcDateCreated: extractDate(root, "property-row-created_time"),
        utcDateModified: extractDate(root, "property-row-last_edited_time")
    };
}

/**
 * Creates the note tree under a fresh "Notion import" root. Notion encodes the hierarchy through the
 * folder structure: a page `Title <id>.html` keeps its children in a sibling folder named after its title
 * (no id, e.g. `Title/`). So each page is parented under whichever page "owns" its containing folder —
 * matched on a normalized, id-stripped folder path so it works whether or not the folders carry ids.
 * Pages are created shallowest-first, so a parent's note exists before its children. Returns the root.
 */
function createNotes(importRootNote: BNote, pages: ParsedPage[], resources: Map<string, Uint8Array>, taskContext: TaskContext<"importNotes">, csvColumnsByFolder: Map<string, string[]>): BNote {
    /* v8 ignore next -- the protected branch needs a protected import root with an active protected session, which the in-memory test DB has no way to set up */
    const isProtected = importRootNote.isProtected && protectedSessionService.isProtectedSessionAvailable();

    const rootNote = noteService.createNewNote({ parentNoteId: importRootNote.noteId, title: t("notion_import.root-title"), content: "", type: "text", mime: "text/html", isProtected }).note;
    rootNote.addLabel("iconClass", "bx bx-import");

    const noteByFolder = new Map<string, BNote>();
    const targetByPageId = new Map<string, LinkTarget>();
    const created: { note: BNote; content: string; page: ParsedPage }[] = [];
    const ordered = [...pages].sort((a, b) => folderDepth(a.path) - folderDepth(b.path));

    // First pass: create every note (so cross-page links can resolve in the second pass) and save its
    // referenced images as attachments. Content is only rewritten/saved once, in the second pass.
    for (const page of ordered) {
        const targetParentId = noteByFolder.get(parentFolderKey(page.path))?.noteId ?? rootNote.noteId;

        const { note } = noteService.createNewNote({
            parentNoteId: targetParentId,
            title: page.title,
            content: page.content,
            type: "text",
            mime: "text/html",
            isProtected
        });
        noteByFolder.set(ownedFolderKey(page.path), note);
        targetByPageId.set(page.id, { noteId: note.noteId, title: page.title });

        // Carry the page's Notion database properties over as Trilium attributes (e.g. a "Text column" →
        // #Text_column). File columns become attachments; relations are deferred to the second pass.
        for (const property of page.properties) {
            if (property.kind === "file") {
                saveFileAttachment(note, property.value, page.path, resources);
            } else if (property.kind !== "relation") {
                note.addLabel(sanitizeAttributeName(property.name), property.value);
            }
        }

        // Attachments hang off the note, so this must run after creation; it returns the content with the
        // <img> srcs and file links pointing at the saved attachments.
        const withImages = rewriteImages(note, page.content, page.path, resources);
        created.push({ note, content: rewriteAttachments(note, withImages, page.path, resources), page });
        taskContext.increaseProgressCount();
    }

    // Now that every container and its rows exist, define the database schema once per container.
    applyDatabaseSchemas(pages, noteByFolder, csvColumnsByFolder);

    // Second pass: now that every page has a note, resolve cross-page links and persist the final content.
    for (const { note, content, page } of created) {
        const finalContent = rewriteLinks(content, (notionId) => targetByPageId.get(notionId) ?? null);
        if (finalContent !== page.content) {
            note.setContent(finalContent);
        }

        // Relation columns become Trilium relations: resolve each target's Notion id to its note, dropping
        // any target that wasn't part of this import.
        for (const property of page.properties) {
            if (property.kind === "relation") {
                const target = targetByPageId.get(property.value);
                if (target) {
                    note.addRelation(sanitizeAttributeName(property.name), target.noteId);
                }
            }
        }

        // Preserve Notion's original timestamps. Must run after the content save above, which would
        // otherwise re-stamp the modification date with "now".
        if (page.utcDateCreated || page.utcDateModified) {
            note.setDateCreatedAndModified(page.utcDateCreated ?? page.utcDateModified, page.utcDateModified ?? page.utcDateCreated);
        }
    }

    return rootNote;
}

/**
 * A Notion database's columns are a schema shared by every row, so each column becomes a single
 * *inheritable* promoted-attribute definition on the row's container note (the database) — not a copy on
 * each row. Rows carry only the values (added in the first pass) and inherit the definition, so a row with
 * no value shows the field empty, mirroring how a Notion property added from any row appears on all of them.
 *
 * A row's container is its parent note, looked up by the same folder key that drives parenting. Each
 * container's schema is the union of its rows' property columns — a column present on only one row still
 * defines the field for the whole database — keeping the first occurrence's type/multiplicity, and emitted
 * in the database's CSV column order ({@link orderColumns}).
 */
function applyDatabaseSchemas(pages: ParsedPage[], noteByFolder: Map<string, BNote>, csvColumnsByFolder: Map<string, string[]>) {
    const schemaByFolder = new Map<string, Map<string, NotionProperty>>();

    for (const page of pages) {
        const folderKey = parentFolderKey(page.path);
        if (!noteByFolder.has(folderKey) || page.properties.length === 0) {
            continue;
        }

        let schema = schemaByFolder.get(folderKey);
        if (!schema) {
            schema = new Map();
            schemaByFolder.set(folderKey, schema);
        }
        for (const property of page.properties) {
            if (property.kind === "file") {
                continue; // files become attachments, not promoted definitions
            }
            const labelName = sanitizeAttributeName(property.name);
            if (!schema.has(labelName)) {
                schema.set(labelName, property);
            }
        }
    }

    for (const [folderKey, schema] of schemaByFolder) {
        const container = noteByFolder.get(folderKey);
        /* v8 ignore next 3 -- every folderKey here passed the noteByFolder.has guard above */
        if (!container) {
            continue;
        }
        // Assign an increasing position so the columns keep the CSV order in the promoted-attributes UI:
        // it sorts definitions by position, and equal positions don't sort deterministically.
        let position = 0;
        for (const property of orderColumns([...schema.values()], csvColumnsByFolder.get(folderKey))) {
            position += 10;
            // A definition is always a label, but its name is `relation:<x>` for a relation column, `label:<x>` otherwise.
            const definitionName = `${property.kind === "relation" ? "relation" : "label"}:${sanitizeAttributeName(property.name)}`;
            container.addAttribute("label", definitionName, buildPromotedDefinition(property), true, position);
        }
    }
}

/**
 * Orders a database's columns by the CSV export's column order (the authoritative Notion order, including
 * columns empty on every row). Columns absent from the CSV keep their discovery order at the end; a
 * synthesized `<name> end` column (from a date range) is slotted right after its base column.
 */
function orderColumns(properties: NotionProperty[], csvColumns: string[] | undefined): NotionProperty[] {
    if (!csvColumns) {
        return properties;
    }

    const indexByColumn = new Map(csvColumns.map((name, index) => [name, index] as const));
    const sortKey = (property: NotionProperty): [number, number] => {
        const own = indexByColumn.get(sanitizeAttributeName(property.name));
        if (own !== undefined) {
            return [own, 0];
        }
        // A synthesized "<name> end" column isn't in the CSV; place it just after its base column.
        if (property.name.endsWith(" end")) {
            const base = indexByColumn.get(sanitizeAttributeName(property.name.slice(0, -" end".length)));
            if (base !== undefined) {
                return [base, 1];
            }
        }
        return [Number.MAX_SAFE_INTEGER, 0];
    };

    return properties
        .map((property, index) => ({ property, index, key: sortKey(property) }))
        .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.index - b.index)
        .map((entry) => entry.property);
}

/** Builds a promoted-attribute definition value (e.g. `promoted,single,text,alias=Text column`). */
function buildPromotedDefinition({ name, labelType, multiplicity }: NotionProperty): string {
    // The alias keeps the original (pretty) column name in the UI while the attribute name stays sanitized.
    // The definition is comma/`=`-delimited, so neutralize those characters in the alias to avoid corrupting it.
    const alias = name.replace(/[,=]/g, " ").trim();
    // A relation has no value type; a label carries one (text/date/url/boolean/…).
    const type = labelType ? `${labelType},` : "";
    return `promoted,${multiplicity},${type}alias=${alias}`;
}

/**
 * Saves each in-zip image a page references as an attachment on `note` and rewrites the `<img src>` to
 * point at it. References that don't resolve to a bundled file (e.g. external image URLs) are left as-is.
 * Returns the (possibly unchanged) content.
 */
function rewriteImages(note: BNote, content: string, pagePath: string, resources: Map<string, Uint8Array>): string {
    const root = parse(content);
    let changed = false;

    for (const img of root.querySelectorAll("img")) {
        const src = img.getAttribute("src");
        if (!src) {
            continue;
        }
        const resourcePath = resolveResourcePath(pagePath, src);
        const bytes = resources.get(resourcePath);
        if (!bytes) {
            continue;
        }
        const { attachmentId, title } = imageService.saveImageToAttachment(note.noteId, bytes, baseName(resourcePath), false);
        /* v8 ignore next -- saveImageToAttachment always returns the id of the attachment it just created, so this guard is never false in practice */
        if (attachmentId) {
            img.setAttribute("src", `api/attachments/${attachmentId}/image/${encodeURIComponent(title)}`);
            changed = true;
        }
    }

    return changed ? root.toString() : content;
}

/**
 * Saves each in-zip file a page attaches (`<a class="notion-attachment">`, produced by the converter) as a
 * `role:"file"` attachment on `note`, and rewrites the anchor into a Trilium attachment reference-link
 * (the same shape the ENEX importer and CKEditor use). Anchors whose file isn't bundled lose the marker
 * class and stay plain links. Returns the (possibly unchanged) content.
 */
function rewriteAttachments(note: BNote, content: string, pagePath: string, resources: Map<string, Uint8Array>): string {
    const root = parse(content);
    let changed = false;

    for (const anchor of root.querySelectorAll("a.notion-attachment")) {
        anchor.removeAttribute("class");
        changed = true;

        const href = anchor.getAttribute("href");
        const resourcePath = href ? resolveResourcePath(pagePath, href) : "";
        const bytes = resources.get(resourcePath);
        if (!bytes) {
            continue;
        }

        const title = anchor.textContent.trim() || baseName(resourcePath);
        const attachment = note.saveAttachment({
            role: "file",
            mime: mimeService.getMime(baseName(resourcePath)) || "application/octet-stream",
            title,
            content: bytes
        });
        anchor.setAttribute("href", `#root/${note.noteId}?viewMode=attachments&attachmentId=${attachment.attachmentId}`);
        anchor.setAttribute("class", "reference-link");
    }

    return changed ? root.toString() : content;
}

/**
 * Saves a File-property reference as a `role:"file"` attachment on `note`. `href` is the value of one
 * `<a>` in the file cell; it's resolved against the zip the same way page content is, so only files bundled
 * in the export attach — an external link (or a missing file) is silently skipped.
 */
function saveFileAttachment(note: BNote, href: string, pagePath: string, resources: Map<string, Uint8Array>) {
    const resourcePath = resolveResourcePath(pagePath, href);
    const bytes = resources.get(resourcePath);
    if (!bytes) {
        return;
    }

    const title = baseName(resourcePath);
    note.saveAttachment({
        role: "file",
        mime: mimeService.getMime(title) || "application/octet-stream",
        title,
        content: bytes
    });
}

/** A resolved import target: the note created for a Notion page, plus that page's title. */
export interface LinkTarget {
    noteId: string;
    title: string;
}

/**
 * Resolves Notion page-to-page links. Notion exports an internal link as an `<a>` whose href points at
 * the target page's exported HTML file (e.g. `Folder/Subpage 386c…cd5.html`), with the 32-hex Notion id
 * embedded in the filename. Rewrites each link whose target was imported to `#root/<noteId>`; when the
 * link text is the target page's title it becomes a Trilium reference link (the live-title chip),
 * otherwise the original text is kept on a plain internal link. External/unresolved links are untouched.
 */
export function rewriteLinks(html: string, resolve: (notionId: string) => LinkTarget | null): string {
    const root = parse(html);
    let changed = false;

    for (const anchor of root.querySelectorAll("a")) {
        const notionId = internalPageId(anchor.getAttribute("href"));
        if (!notionId) {
            continue;
        }
        const target = resolve(notionId);
        if (!target) {
            continue;
        }

        anchor.setAttribute("href", `#root/${target.noteId}`);
        if (anchor.textContent.trim() === target.title.trim()) {
            anchor.setAttribute("class", "reference-link");
        }
        changed = true;
    }

    return changed ? root.toString() : html;
}

/** Extracts the target page's Notion id from an internal `.html` link href, or null if it isn't one. */
function internalPageId(href: string | undefined): string | null {
    if (!href) {
        return null;
    }
    let decoded = href;
    try {
        decoded = decodeURIComponent(href);
    } catch {
        // Leave malformed percent-encoding as-is rather than throwing.
    }
    const path = decoded.split(/[?#]/)[0];
    if (!path.toLowerCase().endsWith(".html")) {
        return null;
    }
    // Match against the path only: a 32-hex sequence in a query/hash must not be mistaken for the page id.
    return getNotionId(path) ?? null;
}

/**
 * Resolves an `<img src>` (zip-relative, percent-encoded) against the page's directory in the zip,
 * returning a normalized path that matches the keys collected in {@link parseZip}.
 */
export function resolveResourcePath(pagePath: string, src: string): string {
    let decoded = src;
    try {
        decoded = decodeURIComponent(src);
    } catch {
        // Leave malformed percent-encoding as-is rather than throwing.
    }
    const lastSlash = pagePath.lastIndexOf("/");
    const baseDir = lastSlash >= 0 ? pagePath.slice(0, lastSlash) : "";
    return normalizePath(baseDir ? `${baseDir}/${decoded}` : decoded);
}

/** Collapses `.`/`..` segments in a forward-slash zip path and drops empty segments. */
function normalizePath(path: string): string {
    const parts: string[] = [];
    for (const segment of path.split("/")) {
        if (segment === "" || segment === ".") {
            continue;
        }
        if (segment === "..") {
            parts.pop();
        } else {
            parts.push(segment);
        }
    }
    return parts.join("/");
}

/** Folder depth of a page path — pages are created shallowest-first so parents precede their children. */
function folderDepth(path: string): number {
    return path.split("/").length;
}

/**
 * The folder a page's children live in: its directory plus its own title (the file's id and extension
 * dropped). Keyed against {@link parentFolderKey} to attach children to their parent.
 */
export function ownedFolderKey(path: string): string {
    const title = stripNotionId(removeExtension(baseName(path)));
    const dir = dirname(path);
    return folderKey(dir ? `${dir}/${title}` : title);
}

/** A page's containing folder (its path's directory), normalized for matching against an owned folder. */
export function parentFolderKey(path: string): string {
    return folderKey(dirname(path));
}

/** Strips the Notion id from each segment so a title-only folder (`Title`) and a page (`Title <id>`) match. */
function folderKey(folderPath: string): string {
    return folderPath.split("/").map((segment) => stripNotionId(segment)).join("/");
}

function dirname(path: string): string {
    const lastSlash = path.lastIndexOf("/");
    return lastSlash >= 0 ? path.slice(0, lastSlash) : "";
}

/**
 * Returns the Notion id of `body`'s page-wrapper child. Only `body`'s direct children are considered: a
 * nested block whose id happens to match the 32-hex pattern must not be taken for the page id.
 */
export function firstChildNotionId(body: HTMLElement | null): string | undefined {
    if (!body) {
        return undefined;
    }
    for (const child of body.childNodes) {
        if (child instanceof HTMLElement) {
            const id = getNotionId(child.getAttribute("id") ?? "");
            if (id) {
                return id;
            }
        }
    }
    return undefined;
}

/**
 * Reads a page's database properties from its Notion properties table. Each column is a
 * `<tr class="property-row property-row-<type>">` whose `<th>` holds the column name (after an icon span,
 * which carries no text) and `<td>` the value. Handled so far:
 *  - `text` / `select` / `status` / `place`: the cell's text → one single-valued property;
 *  - `multi_select`: each `<span class="selected-value">` option → one entry of a multi-valued property;
 *  - `url` / `email` / `phone_number`: the anchor's href → one single-valued url-typed property (email gets `mailto:`, phone `tel:`);
 *  - `date`: the `<time>` value → a `date`/`datetime` label; a range adds a separate `<name> end` column;
 *  - `checkbox`: `checkbox-on`/`checkbox-off` → a `true`/`false` boolean label;
 *  - `person`: each `<span class="user">` name (its avatar stripped) → an entry of a multi-valued property;
 *  - `relation`: each linked page's `<a>` href → a multi-valued relation, resolved to a note in the second pass;
 *  - `file`: each `<a>` href → a `role:"file"` attachment on the note (no promoted definition — it's content).
 * The importer turns each `{ name, value }` into a Trilium label; blank names/values are skipped (Notion
 * sometimes emits an empty cell, e.g. an unset multi-select, which should contribute no label). Other types
 * (dates handled separately by extractDate) fall through untouched.
 */
function extractProperties(root: HTMLElement): NotionProperty[] {
    const properties: NotionProperty[] = [];
    for (const row of root.querySelectorAll("table.properties tr.property-row")) {
        const name = row.querySelector("th")?.textContent?.trim();
        const cell = row.querySelector("td");
        if (!name || !cell) {
            continue;
        }

        const type = row.getAttribute("class")?.match(/property-row-(\w+)/)?.[1];
        if (type === "text" || type === "select" || type === "status" || type === "place") {
            // `select`/`status`/`place` resolve to plain text: the cell text is the whole value (a status'
            // leading `<div class="status-dot">` carries no text), so they take the free-text single path.
            const value = cell.textContent?.trim();
            if (value) {
                properties.push({ name, value, labelType: "text", multiplicity: "single" });
            }
        } else if (type === "multi_select") {
            for (const option of cell.querySelectorAll("span.selected-value")) {
                const value = option.textContent?.trim();
                if (value) {
                    properties.push({ name, value, labelType: "text", multiplicity: "multi" });
                }
            }
        } else if (type === "url" || type === "email" || type === "phone_number") {
            // All three render as `<a class="url-value">`; the href is the canonical value. Email/phone hrefs
            // are bare addresses, so give them a `mailto:`/`tel:` scheme to stay clickable as url labels.
            const href = cell.querySelector("a")?.getAttribute("href")?.trim();
            if (href) {
                properties.push({ name, value: toUrlValue(type, href), labelType: "url", multiplicity: "single" });
            }
        } else if (type === "date") {
            properties.push(...parseDateProperties(name, cell));
        } else if (type === "checkbox") {
            const checkbox = cell.querySelector("div.checkbox");
            if (checkbox) {
                const value = checkbox.classList.contains("checkbox-on") ? "true" : "false";
                properties.push({ name, value, labelType: "boolean", multiplicity: "single" });
            }
        } else if (type === "person") {
            // A person column can list several users; each is a `<span class="user">` whose leading avatar
            // (`.user-icon`, e.g. an initial) would otherwise bleed into the name, so drop it first.
            for (const user of cell.querySelectorAll("span.user")) {
                user.querySelector(".user-icon")?.remove();
                const value = user.textContent?.trim();
                if (value) {
                    properties.push({ name, value, labelType: "text", multiplicity: "multi" });
                }
            }
        } else if (type === "relation") {
            // Each linked page is an `<a>` whose href carries the target's Notion id; the second pass resolves
            // it to a note and adds a `~relation` (targets outside the import are dropped there).
            for (const anchor of cell.querySelectorAll("a")) {
                const targetId = internalPageId(anchor.getAttribute("href"));
                if (targetId) {
                    properties.push({ name, value: targetId, multiplicity: "multi", kind: "relation" });
                }
            }
        } else if (type === "file") {
            // Each `<a>` href points at a bundled file; the first pass saves it as a `role:"file"` attachment.
            for (const anchor of cell.querySelectorAll("a")) {
                const href = anchor.getAttribute("href");
                if (href) {
                    properties.push({ name, value: href, multiplicity: "multi", kind: "file" });
                }
            }
        }
    }
    return properties;
}

/** Gives an email/phone href a clickable scheme (`mailto:`/`tel:`); a plain url href is returned as-is. */
function toUrlValue(type: string, href: string): string {
    if (type === "email") {
        return href.startsWith("mailto:") ? href : `mailto:${href}`;
    }
    if (type === "phone_number") {
        return href.startsWith("tel:") ? href : `tel:${href}`;
    }
    return href;
}

/**
 * Parses a Notion date column. The value is one `<time>`; a date range joins its start and end with an
 * arrow, which becomes two columns: the original (start) and a separate `<name> end` (end).
 */
function parseDateProperties(name: string, cell: HTMLElement): NotionProperty[] {
    const text = cell.querySelector("time")?.textContent;
    if (!text) {
        return [];
    }

    const [start, end] = text.split("→").map((part) => part.trim());
    return [toDateProperty(name, start), toDateProperty(`${name} end`, end)].filter((p): p is NotionProperty => p !== undefined);
}

/**
 * Turns one date string into a property. A clock time is present only when the column's "include time"
 * option is on, which selects a `datetime` label (local `YYYY-MM-DDTHH:mm`) over a plain `date`
 * (`YYYY-MM-DD`) — the formats the promoted date / datetime-local inputs round-trip. dayjs formats in local
 * time, matching the wall-clock of Notion's timezone-less string. (Mixed date/date-time columns are then
 * reconciled to a single type by {@link reconcileDateColumns}.)
 */
function toDateProperty(name: string, text: string | undefined): NotionProperty | undefined {
    if (!text) {
        return undefined;
    }

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
        return undefined;
    }

    const hasTime = /\d{1,2}:\d{2}/.test(text);
    return hasTime
        ? { name, value: dayjs(date).format("YYYY-MM-DD[T]HH:mm"), labelType: "datetime", multiplicity: "single" }
        : { name, value: dayjs(date).format("YYYY-MM-DD"), labelType: "date", multiplicity: "single" };
}

/**
 * Notion's "include time" is toggled per date value, so one date column can mix dates and date-times. A
 * Trilium promoted attribute has a single type, so resolve each date column (scoped to its database, keyed
 * by sanitized name) to `datetime` if *any* of its values carries a time, then normalize every value to
 * that type — a time-less value in a datetime column gets midnight (`T00:00`) so it stays valid for the
 * `datetime-local` input. Mutates the parsed pages in place before notes (and their labels) are created.
 */
function reconcileDateColumns(pages: ParsedPage[]) {
    const columnsWithTime = new Set<string>();
    for (const page of pages) {
        for (const property of page.properties) {
            if (property.labelType === "datetime") {
                columnsWithTime.add(dateColumnKey(page.path, property.name));
            }
        }
    }

    for (const page of pages) {
        for (const property of page.properties) {
            const isDateColumn = property.labelType === "date" || property.labelType === "datetime";
            if (isDateColumn && columnsWithTime.has(dateColumnKey(page.path, property.name))) {
                property.labelType = "datetime";
                if (!property.value.includes("T")) {
                    property.value = `${property.value}T00:00`;
                }
            }
        }
    }
}

/** Identifies a date column within its database: the row's container folder plus the sanitized column name. */
function dateColumnKey(path: string, name: string): string {
    // A space separates the parts unambiguously: a sanitized attribute name never contains a space, so the
    // text after the last space is always the column name and everything before it is the container folder.
    return `${parentFolderKey(path)} ${sanitizeAttributeName(name)}`;
}

/**
 * Reads a Notion property-row timestamp (created/last-edited) from the page's properties table and
 * converts it to Trilium's UTC DB format. Returns undefined when the row, the <time> element or the
 * parsed date is missing/invalid.
 */
function extractDate(root: HTMLElement, rowClass: string): string | undefined {
    const text = root.querySelector(`tr.${rowClass} time`)?.textContent?.replace(/@/g, "").trim();
    if (!text) {
        return undefined;
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? undefined : dateUtils.utcDateTimeStr(date);
}

function isDirectory(path: string): boolean {
    return path.endsWith("/");
}

function baseName(path: string): string {
    /* v8 ignore next -- String.split always yields at least one element (""), so pop() is never undefined and the `?? path` fallback is unreachable */
    return path.split("/").pop() ?? path;
}

function removeExtension(name: string): string {
    return name.replace(/\.[^.]+$/, "");
}

export default { importNotion };
