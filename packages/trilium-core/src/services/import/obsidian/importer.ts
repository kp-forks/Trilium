/**
 * Imports an Obsidian vault (a zipped folder of Markdown files plus attachments) into a Trilium note tree.
 *
 * This pass reconstructs the *structure*: every `.md` file becomes a `text` note whose Markdown body is
 * rendered to HTML, and the vault's folder hierarchy is mirrored as the note tree (a folder becomes an empty
 * container note holding its notes). The `.obsidian/` config folder and any other dot-prefixed entry are
 * skipped, and non-Markdown files (attachments, `.canvas`, `.base`, …) are dropped for now.
 *
 * Deferred to later passes (so they currently render as literal text or placeholder links): wikilinks
 * `[[…]]`, embeds `![[…]]`, frontmatter → labels, tags, callouts, highlights/comments, and attachments.
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
import { decodeUtf8 } from "../../utils/binary.js";
import { basename } from "../../utils/path.js";
import { getZipProvider } from "../../zip_provider.js";
import markdownService from "../markdown.js";

interface VaultNote {
    /** The note's normalized POSIX path within the vault, e.g. `Folder 1/First note.md`. */
    path: string;
    title: string;
    markdown: string;
}

async function importObsidian(taskContext: TaskContext<"importNotes">, fileBuffer: Uint8Array, importRootNote: BNote, _fileName?: string): Promise<BNote> {
    const notes = await parseVault(fileBuffer);
    taskContext.setTotalCount(notes.length);

    return createNotes(importRootNote, notes, taskContext);
}

/**
 * Reads the vault zip, collecting one {@link VaultNote} per Markdown file. The `.obsidian/` config folder
 * and any other dot-prefixed entry are skipped, as is every non-Markdown file (handled in later passes).
 * Sorted by path so the resulting tree is built (and ordered) deterministically.
 */
async function parseVault(fileBuffer: Uint8Array): Promise<VaultNote[]> {
    const provider = getZipProvider();
    const notes: VaultNote[] = [];
    const filenameEncoding = await provider.detectFilenameEncoding(fileBuffer);

    await provider.readZipFile(fileBuffer, async (entry, readContent) => {
        const path = normalizePath(entry.fileName);
        if (isDirectory(path) || isIgnored(path) || !isMarkdown(path)) {
            return;
        }
        notes.push({ path, title: noteTitle(path), markdown: decodeUtf8(await readContent()) });
    }, filenameEncoding);

    notes.sort((a, b) => a.path.localeCompare(b.path));
    return notes;
}

/**
 * Builds the note tree under a fresh "Obsidian import" root. Each note is parented under the container note
 * for its folder (created on demand by {@link ensureFolder}, so a folder note exists before its children),
 * with its Markdown rendered to HTML. Returns the import root.
 */
function createNotes(importRootNote: BNote, notes: VaultNote[], taskContext: TaskContext<"importNotes">): BNote {
    /* v8 ignore next -- the protected branch needs a protected import root with an active protected session, which the in-memory test DB has no way to set up */
    const isProtected = !!(importRootNote.isProtected && protectedSessionService.isProtectedSessionAvailable());

    const rootNote = noteService.createNewNote({ parentNoteId: importRootNote.noteId, title: t("obsidian_import.root-title"), content: "", type: "text", mime: "text/html", isProtected }).note;
    rootNote.addLabel("iconClass", "bx bx-import");

    // Folder path (POSIX) -> its container note. The empty path maps to the import root.
    const folderNotes = new Map<string, BNote>();

    for (const note of notes) {
        const parent = ensureFolder(parentFolder(note.path), rootNote, folderNotes, isProtected);
        const content = markdownService.renderToHtml(note.markdown, note.title);
        noteService.createNewNote({ parentNoteId: parent.noteId, title: note.title, content, type: "text", mime: "text/html", isProtected });
        taskContext.increaseProgressCount();
    }

    return rootNote;
}

/** Returns (creating on demand, parents first) the container note for `folderPath`; the empty path is the root. */
function ensureFolder(folderPath: string, rootNote: BNote, folderNotes: Map<string, BNote>, isProtected: boolean): BNote {
    if (folderPath === "") {
        return rootNote;
    }
    const cached = folderNotes.get(folderPath);
    if (cached) {
        return cached;
    }
    const parent = ensureFolder(parentFolder(folderPath), rootNote, folderNotes, isProtected);
    const { note } = noteService.createNewNote({ parentNoteId: parent.noteId, title: basename(folderPath), content: "", type: "text", mime: "text/html", isProtected });
    folderNotes.set(folderPath, note);
    return note;
}

/** The POSIX parent-folder path of `path` (everything before the last `/`), or `""` when at the vault root. */
function parentFolder(path: string): string {
    const slash = path.lastIndexOf("/");
    return slash === -1 ? "" : path.slice(0, slash);
}

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/");
}

/** A zip directory entry (trailing slash) carries no content. */
function isDirectory(path: string): boolean {
    return path.endsWith("/");
}

/** Skips the `.obsidian/` config folder and every other dot-prefixed entry (`.trash/`, `.DS_Store`, …). */
function isIgnored(path: string): boolean {
    return path.split("/").some((segment) => segment.startsWith("."));
}

function isMarkdown(path: string): boolean {
    return path.toLowerCase().endsWith(".md");
}

/** The note title for a Markdown file: its base name without the `.md` extension. */
function noteTitle(path: string): string {
    return basename(path).replace(/\.md$/i, "");
}

export default { importObsidian };
