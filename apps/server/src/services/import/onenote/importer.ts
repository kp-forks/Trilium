/**
 * Creates the Trilium note tree from a OneNote selection. Mirrors the structure of the existing
 * file-based importers (see packages/trilium-core/src/services/import/enex.ts): build a container,
 * then child notes, reporting progress through a TaskContext of type "importNotes" so the existing
 * client-side import toasts apply unchanged.
 */

import { becca, note_service as noteService, protected_session as protectedSession, TaskContext } from "@triliumnext/core";

import sql from "../../sql.js";
import converter from "./converter.js";
import graph from "./graph.js";

export interface SectionSelection {
    id: string;
    title: string;
    notebookTitle: string;
}

interface FetchedPage {
    title: string;
    html: string;
    /** The unmodified HTML returned by the Graph API, kept only when debug mode is on. */
    rawHtml: string;
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
    const fetched: FetchedSection[] = [];
    for (const section of sections) {
        const pages = await graph.listPages(accessToken, section.id);
        const fetchedPages: FetchedPage[] = [];
        for (const page of pages) {
            const rawHtml = await graph.getPageContent(accessToken, page.id);
            fetchedPages.push({ title: page.title, html: converter.convertPageHtml(rawHtml), rawHtml });
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

            // Debug aid: keep the unmodified Graph HTML alongside the converted note so the two can
            // be compared when diagnosing conversion issues.
            if (debug) {
                pageNote.saveAttachment({
                    role: "file",
                    mime: "text/html",
                    title: "OneNote source.html",
                    content: page.rawHtml
                });
            }
        }
    }

    return rootNote.noteId;
}

export default { importSelection };
