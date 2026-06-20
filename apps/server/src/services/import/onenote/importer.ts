/**
 * Creates the Trilium note tree from a OneNote selection. Mirrors the structure of the existing
 * file-based importers (see packages/trilium-core/src/services/import/enex.ts): build a container,
 * then child notes, reporting progress through a TaskContext of type "importNotes" so the existing
 * client-side import toasts apply unchanged.
 */

import { becca, binary_utils, type BNote, getLog, imageService, note_service as noteService, protected_session as protectedSession, TaskContext } from "@triliumnext/core";
import { parse } from "node-html-parser";

import sql from "../../sql.js";
import converter, { ONENOTE_ATTACHMENT_CLASS } from "./converter.js";
import graph, { type OneNotePage } from "./graph.js";
import { inkmlToSvg } from "./inkml.js";
import { type LinkTarget, rewritePageLinks } from "./links.js";

export interface SectionSelection {
    id: string;
    title: string;
    notebookTitle: string;
}

interface FetchedPage {
    title: string;
    /** The OneNote page-id GUID, used to resolve cross-page links to the note created for this page. */
    pageId?: string;
    html: string;
    /** The unmodified HTML returned by the Graph API, kept only when debug mode is on. */
    rawHtml: string;
    /** The unmodified InkML (handwriting) returned by the Graph API, kept only when debug mode is on. */
    rawInkml: string;
    /** The page's handwriting/drawing rendered to an SVG, embedded as an inline image (null if none). */
    inkSvg: string | null;
    /** Binary resources (images, file attachments) referenced by the page, downloaded up front. */
    resources: DownloadedResource[];
    /** OneNote's page creation timestamp (ISO 8601), preserved on the imported note. */
    createdDateTime?: string;
    /** OneNote's last-modified timestamp (ISO 8601), preserved on the imported note. */
    lastModifiedDateTime?: string;
}

interface DownloadedResource {
    /** The Graph resource URL as it still appears in the converted HTML; used to match references. */
    url: string;
    kind: "image" | "file";
    /** Original filename for attachments; a base name (no extension) for images. */
    title: string;
    mime: string;
    content: Uint8Array;
}

interface FetchedSection {
    title: string;
    notebookTitle: string;
    pages: FetchedPage[];
}

export async function importSelection({ accessToken, parentNoteId, sections, taskId, debug = false }: { accessToken: string; parentNoteId: string; sections: SectionSelection[]; taskId: string; debug?: boolean }): Promise<string> {
    const taskContext = TaskContext.getInstance(taskId, "importNotes", { safeImport: true });

    // Phase 1: pull everything over the network first, so note creation can run in a single
    // synchronous transaction afterwards.

    // Enumerate every selected section's pages up front so the total page count is known before
    // any content is fetched — this lets the client show a real progress bar rather than a bare count.
    const sectionPages: { section: SectionSelection; pages: OneNotePage[] }[] = [];
    for (const section of sections) {
        sectionPages.push({ section, pages: await graph.listPages(accessToken, section.id) });
    }
    taskContext.setTotalCount(sectionPages.reduce((total, entry) => total + entry.pages.length, 0));

    const fetched: FetchedSection[] = [];
    for (const { section, pages } of sectionPages) {
        const fetchedPages: FetchedPage[] = [];
        for (const page of pages) {
            const { html: rawHtml, inkml } = await graph.getPageContent(accessToken, page.id);
            const html = converter.convertPageHtml(rawHtml);
            const resources = await downloadPageResources(accessToken, html);
            fetchedPages.push({ title: page.title, pageId: page.pageId, html, rawHtml, rawInkml: inkml, inkSvg: inkmlToSvg(inkml), resources, createdDateTime: page.createdDateTime, lastModifiedDateTime: page.lastModifiedDateTime });
            taskContext.increaseProgressCount();
        }
        fetched.push({ title: section.title, notebookTitle: section.notebookTitle, pages: fetchedPages });
    }

    // Phase 2: create the note tree.
    const rootNoteId = sql.transactional(() => createNotes(parentNoteId, fetched, debug));

    taskContext.taskSucceeded({ parentNoteId, importedNoteId: rootNoteId });

    return rootNoteId;
}

function createNotes(parentNoteId: string, sections: FetchedSection[], debug: boolean): string {
    const parentNote = becca.getNoteOrThrow(parentNoteId);
    const isProtected = parentNote.isProtected && protectedSession.isProtectedSessionAvailable();

    const createFolder = (parentId: string, title: string) =>
        noteService.createNewNote({ parentNoteId: parentId, title, content: "", type: "text", mime: "text/html", isProtected }).note;

    const rootNote = createFolder(parentNoteId, "OneNote import");

    // Created page notes with their content-so-far (resources/ink applied), plus a map from each
    // page's OneNote page-id GUID to its imported note (and title) — both feed the link-resolution pass.
    const createdPages: { note: BNote; original: string; content: string; page: FetchedPage }[] = [];
    const targetByPageId = new Map<string, LinkTarget>();

    // Group selected sections under a note per notebook so the original hierarchy is preserved.
    const notebookNotes = new Map<string, string>();
    for (const section of sections) {
        let notebookNoteId = notebookNotes.get(section.notebookTitle);
        if (!notebookNoteId) {
            notebookNoteId = createFolder(rootNote.noteId, section.notebookTitle).noteId;
            notebookNotes.set(section.notebookTitle, notebookNoteId);
        }

        const sectionNote = createFolder(notebookNoteId, section.title);

        for (const page of section.pages) {
            const { note: pageNote } = noteService.createNewNote({
                parentNoteId: sectionNote.noteId,
                title: page.title,
                content: page.html,
                type: "text",
                mime: "text/html",
                isProtected
            });

            // Resources and ink both need the page note to exist (attachments hang off it), so build
            // the per-page content now: swap Graph URLs for local attachment references, then append
            // the page's handwriting/drawing as an inline SVG image. Cross-page links are deferred to a
            // second pass below, once every page has a note to point at.
            let content = page.html;
            if (page.resources.length > 0) {
                content = rewritePageResources(pageNote, content, page.resources);
            }
            if (page.inkSvg) {
                content += renderInkFigure(pageNote, page.inkSvg);
            }

            createdPages.push({ note: pageNote, original: page.html, content, page });
            if (page.pageId) {
                targetByPageId.set(page.pageId, { noteId: pageNote.noteId, title: page.title });
            }

            // Debug aid: keep the unmodified Graph HTML (and InkML, when present) alongside the
            // converted note so the two can be compared when diagnosing conversion issues.
            if (debug) {
                pageNote.saveAttachment({
                    role: "importSource",
                    mime: "text/html",
                    title: "OneNote source.html",
                    content: page.rawHtml
                });
                if (page.rawInkml) {
                    pageNote.saveAttachment({
                        role: "importSource",
                        mime: "application/inkml+xml",
                        title: "OneNote ink.inkml",
                        content: page.rawInkml
                    });
                }
            }
        }
    }

    // Second pass: now that every page has a note, resolve cross-page `onenote:` links and persist the
    // final content. Done once per page (rather than re-saving for resources, then again for links).
    for (const { note, original, content, page } of createdPages) {
        const finalContent = rewritePageLinks(content, (pageId) => targetByPageId.get(pageId) ?? null);
        if (finalContent !== original) {
            note.setContent(finalContent);
            void noteService.asyncPostProcessContent(note, finalContent);
        }

        // Preserve OneNote's original timestamps. Must run after setContent, whose save would otherwise
        // re-stamp the modification date with "now".
        const utcDateCreated = toUtcDbDate(page.createdDateTime);
        const utcDateModified = toUtcDbDate(page.lastModifiedDateTime) ?? utcDateCreated;
        if (utcDateCreated || utcDateModified) {
            note.setDateCreatedAndModified(utcDateCreated, utcDateModified);
        }
    }

    return rootNote.noteId;
}

/** Converts a Graph ISO 8601 timestamp to Trilium's UTC DB format, or undefined if absent/unparseable. */
function toUtcDbDate(isoDateTime: string | undefined): string | undefined {
    if (!isoDateTime) {
        return undefined;
    }
    const date = new Date(isoDateTime);
    return Number.isNaN(date.getTime()) ? undefined : date_utils.utcDateTimeStr(date);
}

/**
 * Saves a page's rendered ink SVG as an image attachment on the note and returns the `<figure>` markup
 * that embeds it inline. Returns an empty string if the attachment could not be created.
 */
function renderInkFigure(note: BNote, svg: string): string {
    const { attachmentId, title } = imageService.saveImageToAttachment(note.noteId, binary_utils.encodeUtf8(svg), "OneNote ink.svg", false);
    if (!attachmentId) {
        return "";
    }
    return `<figure class="image"><img src="api/attachments/${attachmentId}/image/${encodeURIComponent(title)}"></figure>`;
}

/**
 * Finds the Graph resource URLs a converted page references (image `src`, attachment-link `href`) and
 * downloads each once. Failures are logged and skipped so one missing resource doesn't abort the whole
 * import; the reference is simply left untouched.
 */
async function downloadPageResources(accessToken: string, html: string): Promise<DownloadedResource[]> {
    const root = parse(html);

    const refs = new Map<string, Omit<DownloadedResource, "content">>();
    for (const img of root.querySelectorAll("img")) {
        const url = img.getAttribute("src") ?? "";
        if (isGraphResourceUrl(url) && !refs.has(url)) {
            refs.set(url, { url, kind: "image", title: "image", mime: "" });
        }
    }
    for (const anchor of root.querySelectorAll(`a.${ONENOTE_ATTACHMENT_CLASS}`)) {
        const url = anchor.getAttribute("href") ?? "";
        if (isGraphResourceUrl(url) && !refs.has(url)) {
            const title = anchor.textContent.trim() || "attachment";
            refs.set(url, { url, kind: "file", title, mime: anchor.getAttribute("data-mime") || "" });
        }
    }

    const resources: DownloadedResource[] = [];
    for (const ref of refs.values()) {
        try {
            const { content, contentType } = await graph.getResource(accessToken, ref.url);
            resources.push({ ...ref, mime: ref.mime || contentType, content });
        } catch (e: unknown) {
            getLog().error(`OneNote import: could not download resource ${ref.url}: ${e instanceof Error ? e.message : e}`);
        }
    }
    return resources;
}

/**
 * Re-parses the converted page and swaps each downloaded Graph URL for a local Trilium reference:
 * images become attachment-backed `<img src="api/attachments/…">`, file attachments become Trilium
 * reference links. References whose download failed are left as-is.
 */
function rewritePageResources(note: BNote, html: string, resources: DownloadedResource[]): string {
    const byUrl = new Map(resources.map((resource) => [resource.url, resource]));
    const root = parse(html);

    for (const img of root.querySelectorAll("img")) {
        const resource = byUrl.get(img.getAttribute("src") ?? "");
        if (!resource) {
            continue;
        }
        const originalName = resource.title.includes(".") ? resource.title : `${resource.title}.${extensionForMime(resource.mime)}`;
        const { attachmentId, title } = imageService.saveImageToAttachment(note.noteId, resource.content, originalName, false);
        if (attachmentId) {
            img.setAttribute("src", `api/attachments/${attachmentId}/image/${encodeURIComponent(title)}`);
        }
    }

    for (const anchor of root.querySelectorAll(`a.${ONENOTE_ATTACHMENT_CLASS}`)) {
        const resource = byUrl.get(anchor.getAttribute("href") ?? "");
        if (!resource) {
            continue;
        }
        const attachment = note.saveAttachment({ role: "file", mime: resource.mime || "application/octet-stream", title: resource.title, content: resource.content });
        anchor.setAttribute("class", "reference-link");
        anchor.removeAttribute("data-mime");
        anchor.setAttribute("href", `#root/${note.noteId}?viewMode=attachments&attachmentId=${attachment.attachmentId}`);
    }

    return root.toString();
}

function isGraphResourceUrl(url: string): boolean {
    return url.startsWith("https://graph.microsoft.com/") && url.includes("/resources/");
}

/** Derives a file extension from a content type (e.g. `image/png` → `png`, `image/svg+xml` → `svg`). */
function extensionForMime(mime: string): string {
    return mime.split("/")[1]?.split("+")[0] || "png";
}

export default { importSelection };
