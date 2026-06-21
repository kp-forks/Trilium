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

import { t } from "i18next";
import { type HTMLElement, parse } from "node-html-parser";

import type BNote from "../../../becca/entities/bnote.js";
import imageService from "../../image.js";
import noteService from "../../notes.js";
import protectedSessionService from "../../protected_session.js";
import { sanitizeHtml } from "../../sanitizer.js";
import type TaskContext from "../../task_context.js";
import dateUtils from "../../utils/date.js";
import { getZipProvider } from "../../zip_provider.js";
import { convertNotionHtml } from "./converter.js";
import { getNotionId, parseParentIds, stripNotionId } from "./notion_id.js";

interface ParsedPage {
    /** The page's own Notion id, used to resolve child pages and (later) internal links to it. */
    id: string;
    title: string;
    /** Path of the .html entry inside the zip; retained for diagnostics. */
    path: string;
    /** Notion ids of ancestor pages (outermost first); the last is this page's immediate parent. */
    parentIds: string[];
    /** The page's body HTML, sanitized; empty when the body could not be located. */
    content: string;
    utcDateCreated?: string;
    utcDateModified?: string;
}

async function importNotion(taskContext: TaskContext<"importNotes">, fileBuffer: Uint8Array, importRootNote: BNote): Promise<BNote> {
    const { pages, resources } = await parseZip(fileBuffer);
    taskContext.setTotalCount(pages.length);

    return createNotes(importRootNote, pages, resources, taskContext);
}

/**
 * Reads the zip once: HTML entries become parsed pages; every other file (images, attachments) is kept
 * by its normalized path so page content can later reference it. The `index.html` summary is skipped.
 */
async function parseZip(fileBuffer: Uint8Array): Promise<{ pages: ParsedPage[]; resources: Map<string, Uint8Array> }> {
    const provider = getZipProvider();
    const filenameEncoding = await provider.detectFilenameEncoding(fileBuffer);

    const pages: ParsedPage[] = [];
    const resources = new Map<string, Uint8Array>();
    await provider.readZipFile(fileBuffer, async (entry, readContent) => {
        const path = entry.fileName;
        if (isDirectory(path)) {
            return;
        }
        if (path.toLowerCase().endsWith(".html")) {
            if (baseName(path) === "index.html") {
                return;
            }
            const parsed = parsePage(path, new TextDecoder().decode(await readContent()));
            if (parsed) {
                pages.push(parsed);
            }
        } else {
            resources.set(normalizePath(path), await readContent());
        }
    }, filenameEncoding);

    return { pages, resources };
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
        parentIds: parseParentIds(path),
        content,
        utcDateCreated: extractDate(root, "property-row-created_time"),
        utcDateModified: extractDate(root, "property-row-last_edited_time")
    };
}

/**
 * Creates the note tree under a fresh "Notion import" root. Pages are created shallowest-first so a
 * page's parent always exists before it; each page is parented under the note created for its
 * immediate-parent id, or under the import root when it has no (resolvable) parent. Returns that root.
 */
function createNotes(importRootNote: BNote, pages: ParsedPage[], resources: Map<string, Uint8Array>, taskContext: TaskContext<"importNotes">): BNote {
    const isProtected = importRootNote.isProtected && protectedSessionService.isProtectedSessionAvailable();

    const rootNote = noteService.createNewNote({ parentNoteId: importRootNote.noteId, title: t("notion_import.root-title"), content: "", type: "text", mime: "text/html", isProtected }).note;
    rootNote.addLabel("iconClass", "bx bx-import");

    const noteIdByPageId = new Map<string, string>();
    const ordered = [...pages].sort((a, b) => a.parentIds.length - b.parentIds.length);

    for (const page of ordered) {
        const parentPageId = page.parentIds[page.parentIds.length - 1];
        const targetParentId = (parentPageId && noteIdByPageId.get(parentPageId)) || rootNote.noteId;

        const { note } = noteService.createNewNote({
            parentNoteId: targetParentId,
            title: page.title,
            content: page.content,
            type: "text",
            mime: "text/html",
            isProtected
        });
        noteIdByPageId.set(page.id, note.noteId);

        // Save referenced images as attachments and point their <img> at them. Done after creation, since
        // attachments hang off the note; re-saves the content only when an image was actually rewritten.
        const rewritten = rewriteImages(note, page.content, page.path, resources);
        if (rewritten !== page.content) {
            note.setContent(rewritten);
        }

        // Preserve Notion's original timestamps. Must run after the content save above, which would
        // otherwise re-stamp the modification date with "now".
        if (page.utcDateCreated || page.utcDateModified) {
            note.setDateCreatedAndModified(page.utcDateCreated, page.utcDateModified ?? page.utcDateCreated);
        }

        taskContext.increaseProgressCount();
    }

    return rootNote;
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
        if (attachmentId) {
            img.setAttribute("src", `api/attachments/${attachmentId}/image/${encodeURIComponent(title)}`);
            changed = true;
        }
    }

    return changed ? root.toString() : content;
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

/** Returns the Notion id of the first child element of `body` that carries one (Notion's page wrapper). */
function firstChildNotionId(body: HTMLElement | null): string | undefined {
    if (!body) {
        return undefined;
    }
    for (const child of body.querySelectorAll("*")) {
        const id = getNotionId(child.getAttribute("id") ?? "");
        if (id) {
            return id;
        }
    }
    return undefined;
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
    return path.split("/").pop() ?? path;
}

function removeExtension(name: string): string {
    return name.replace(/\.[^.]+$/, "");
}

export default { importNotion };
