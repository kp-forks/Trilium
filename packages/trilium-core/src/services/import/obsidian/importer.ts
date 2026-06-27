/**
 * Imports an Obsidian vault (a zipped folder of Markdown files plus attachments) into a Trilium note tree.
 *
 * This is the integration scaffold only: it creates a fresh "Obsidian import" root and returns it. Vault
 * traversal and structure/content processing — folders → subtree, Markdown → HTML, wikilinks, embeds,
 * frontmatter → labels, tags, callouts, attachments, `.canvas`/`.excalidraw.md` — land in later passes.
 *
 * Invoked from the shared file-import dispatcher (routes/api/import.ts) when the upload is tagged
 * `format=obsidian`, so progress, completion and failure are reported by that dispatcher's TaskContext —
 * this service just builds the tree and returns its root note, like the zip/notion/anytype importers.
 */

import { t } from "i18next";

import type BNote from "../../../becca/entities/bnote.js";
import noteService from "../../notes.js";
import protectedSessionService from "../../protected_session.js";
import type TaskContext from "../../task_context.js";

async function importObsidian(taskContext: TaskContext<"importNotes">, _fileBuffer: Uint8Array, importRootNote: BNote, _fileName?: string): Promise<BNote> {
    /* v8 ignore next -- the protected branch needs a protected import root with an active protected session, which the in-memory test DB has no way to set up */
    const isProtected = importRootNote.isProtected && protectedSessionService.isProtectedSessionAvailable();

    const rootNote = noteService.createNewNote({ parentNoteId: importRootNote.noteId, title: t("obsidian_import.root-title"), content: "", type: "text", mime: "text/html", isProtected }).note;
    rootNote.addLabel("iconClass", "bx bx-import");

    // No notes imported yet — structure processing arrives in a later pass.
    taskContext.setTotalCount(0);

    return rootNote;
}

export default { importObsidian };
