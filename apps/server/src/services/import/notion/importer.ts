/**
 * Imports a Notion HTML-export zip into a Trilium note tree.
 *
 * Notion exports each page as `Page Title <id>.html`; a page that has children also gets a sibling
 * folder `Page Title <id>/` holding those children. Internal links and attachments reference the same
 * id-suffixed names. This first iteration reconstructs only the *structure* — the page hierarchy, titles
 * and original timestamps — copying each page's body HTML across roughly as-is. Faithful HTML cleanup,
 * link rewriting, images/attachments and database (CSV) handling are deliberately deferred.
 *
 * Like the OneNote importer, it runs in the background and reports progress, completion and failure over
 * the WebSocket via an "importNotes" TaskContext, so it never throws to the caller.
 */

import { becca, date_utils, getLog, getZipProvider, note_service as noteService, protected_session as protectedSession, sanitize, TaskContext } from "@triliumnext/core";
import { t } from "i18next";
import { type HTMLElement, parse } from "node-html-parser";

import sql from "../../sql.js";
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

export async function importZip({ fileBuffer, parentNoteId, taskId }: { fileBuffer: Uint8Array; parentNoteId: string; taskId: string }): Promise<void> {
    const taskContext = TaskContext.getInstance(taskId, "importNotes", { safeImport: true });

    try {
        const pages = await parsePages(fileBuffer);
        taskContext.setTotalCount(pages.length);

        const rootNoteId = sql.transactional(() => createNotes(parentNoteId, pages, taskContext));

        taskContext.taskSucceeded({ parentNoteId, importedNoteId: rootNoteId });
    } catch (e: unknown) {
        getLog().error(`Notion import failed: ${e instanceof Error ? (e.stack ?? e.message) : e}`);
        taskContext.reportError(e instanceof Error ? e.message : String(e));
    }
}

/** Reads every page (.html entry) out of the zip, parsing its title, ancestry, dates and body HTML. */
async function parsePages(fileBuffer: Uint8Array): Promise<ParsedPage[]> {
    const provider = getZipProvider();
    const filenameEncoding = await provider.detectFilenameEncoding(fileBuffer);

    const pages: ParsedPage[] = [];
    await provider.readZipFile(fileBuffer, async (entry, readContent) => {
        const path = entry.fileName;
        // Notion exports the page body as HTML; everything else (images, the per-database CSV, the
        // summary index.html) is deferred to a later iteration.
        if (!path.toLowerCase().endsWith(".html") || isDirectory(path) || baseName(path) === "index.html") {
            return;
        }

        const html = new TextDecoder().decode(await readContent());
        const parsed = parsePage(path, html);
        if (parsed) {
            pages.push(parsed);
        }
    }, filenameEncoding);

    return pages;
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
    const content = pageBody ? sanitize.sanitizeHtml(pageBody.innerHTML) : "";

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
 * Creates the note tree. Pages are created shallowest-first so a page's parent always exists before it;
 * each page is parented under the note created for its immediate-parent id, or under the import root when
 * it has no (resolvable) parent. Returns the import root's note id.
 */
function createNotes(parentNoteId: string, pages: ParsedPage[], taskContext: TaskContext<"importNotes">): string {
    const parentNote = becca.getNoteOrThrow(parentNoteId);
    const isProtected = parentNote.isProtected && protectedSession.isProtectedSessionAvailable();

    const rootNote = noteService.createNewNote({ parentNoteId, title: t("notion_import.root-title"), content: "", type: "text", mime: "text/html", isProtected }).note;
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

        // Preserve Notion's original timestamps. Must run after createNewNote's content save, which would
        // otherwise re-stamp the modification date with "now".
        if (page.utcDateCreated || page.utcDateModified) {
            note.setDateCreatedAndModified(page.utcDateCreated, page.utcDateModified ?? page.utcDateCreated);
        }

        taskContext.increaseProgressCount();
    }

    return rootNote.noteId;
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
    return Number.isNaN(date.getTime()) ? undefined : date_utils.utcDateTimeStr(date);
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

export default { importZip };
