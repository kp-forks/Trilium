/**
 * Imports a Google Keep (Google Takeout) export zip into a Trilium note tree.
 *
 * Takeout exports each Keep note as `<title-or-timestamp>.json` (plus a redundant `.html`/`.txt` and any
 * attachment files alongside). Keep has no hierarchy — notes are a flat list organised only by labels — so
 * this importer creates every note directly under a single "Google Keep import" root. This first iteration
 * reconstructs only the *basic structure*: each note's title, body (plain text or checklist) and original
 * timestamps. Labels, attachments, colours, pinned/archived/trashed flags and rich-text (the JSON's
 * `textContentHtml`) are deliberately deferred.
 *
 * Invoked from the shared file-import dispatcher (routes/api/import.ts) when the upload is tagged
 * `format=keep`, so progress, completion and failure are reported by that dispatcher's TaskContext — this
 * service just builds the tree and returns its root note, like the zip/notion importers.
 */

import { t } from "i18next";

import type BNote from "../../../becca/entities/bnote.js";
import noteService from "../../notes.js";
import protectedSessionService from "../../protected_session.js";
import { sanitizeHtml } from "../../sanitizer.js";
import type TaskContext from "../../task_context.js";
import dateUtils from "../../utils/date.js";
import { getZipProvider } from "../../zip_provider.js";
import { convertKeepHtml, convertKeepHtmlInline } from "./converter.js";

/** A checklist row in a Keep note (`listContent`). */
interface KeepListItem {
    text?: string;
    /** Rich-text (basic formatting) variant of `text`; preferred when present. */
    textHtml?: string;
    isChecked?: boolean;
}

/** The subset of a Keep Takeout note JSON this iteration reads. */
interface KeepNote {
    title?: string;
    /** Plain-text body of a text note; fallback when `textContentHtml` is absent. */
    textContent?: string;
    /** Rich-text (basic formatting) body of a text note; preferred when present. */
    textContentHtml?: string;
    /** Body of a checklist note; mutually exclusive with the text fields. */
    listContent?: KeepListItem[];
    /** Creation/last-edit timestamps, in microseconds since the Unix epoch. */
    createdTimestampUsec?: number;
    userEditedTimestampUsec?: number;
}

interface ParsedNote {
    title: string;
    /** Body HTML; empty when the note has neither text nor list content. */
    content: string;
    utcDateCreated?: string;
    utcDateModified?: string;
}

async function importKeep(taskContext: TaskContext<"importNotes">, fileBuffer: Uint8Array, importRootNote: BNote): Promise<BNote> {
    const notes = await parseNotes(fileBuffer);
    taskContext.setTotalCount(notes.length);

    return createNotes(importRootNote, notes, taskContext);
}

/** Reads every note (.json entry) out of the zip, parsing its title, dates and body. */
async function parseNotes(fileBuffer: Uint8Array): Promise<ParsedNote[]> {
    const provider = getZipProvider();
    const filenameEncoding = await provider.detectFilenameEncoding(fileBuffer);

    const notes: ParsedNote[] = [];
    await provider.readZipFile(fileBuffer, async (entry, readContent) => {
        const path = entry.fileName;
        // Each note is a .json file; the redundant per-note .html/.txt, the Labels.txt index and the
        // attachment binaries are skipped. (Labels.txt also ends in a non-.json extension, so it's covered.)
        if (!path.toLowerCase().endsWith(".json") || isDirectory(path)) {
            return;
        }

        const parsed = parseNote(path, new TextDecoder().decode(await readContent()));
        if (parsed) {
            notes.push(parsed);
        }
    }, filenameEncoding);

    return notes;
}

export function parseNote(path: string, json: string): ParsedNote | null {
    let note: KeepNote;
    try {
        note = JSON.parse(json) as KeepNote;
    } catch {
        // A non-note JSON (or a malformed entry) is skipped rather than failing the whole import.
        return null;
    }

    // Untitled Keep notes export with an empty `title`; their filename is the note's timestamp, which at
    // least keeps them distinguishable.
    const title = note.title?.trim() || removeExtension(baseName(path)) || "Untitled";

    return {
        title,
        content: buildContent(note),
        utcDateCreated: usecToUtc(note.createdTimestampUsec),
        utcDateModified: usecToUtc(note.userEditedTimestampUsec)
    };
}

/**
 * Builds a note's body HTML from its checklist or text content (whichever is present). For both, Keep's
 * rich-text variant (`textHtml`/`textContentHtml`, basic bold/italic/underline formatting) is preferred,
 * falling back to the plain-text field. The result is sanitized downstream, in {@link createNotes}.
 */
function buildContent(note: KeepNote): string {
    if (note.listContent?.length) {
        const items = note.listContent
            .filter((item) => item.text)
            .map((item) => {
                // Match the canonical CKEditor task-list serialization (checked before disabled).
                const attributes = item.isChecked ? ` checked="checked" disabled="disabled"` : ` disabled="disabled"`;
                const label = item.textHtml ? convertKeepHtmlInline(item.textHtml) : escapeHtml(item.text ?? "");
                return `<li><label class="todo-list__label"><input type="checkbox"${attributes}><span class="todo-list__label__description">${label}</span></label></li>`;
            });
        return items.length ? `<ul class="todo-list">${items.join("")}</ul>` : "";
    }

    if (note.textContentHtml) {
        return convertKeepHtml(note.textContentHtml);
    }

    if (note.textContent) {
        return note.textContent
            .split("\n")
            .map((line) => `<p>${escapeHtml(line)}</p>`)
            .join("");
    }

    return "";
}

/**
 * Creates the (flat) note tree under a fresh "Google Keep import" root — Keep has no page hierarchy, so
 * every note is parented directly under that root. Returns the root.
 */
function createNotes(importRootNote: BNote, notes: ParsedNote[], taskContext: TaskContext<"importNotes">): BNote {
    const isProtected = importRootNote.isProtected && protectedSessionService.isProtectedSessionAvailable();

    const rootNote = noteService.createNewNote({ parentNoteId: importRootNote.noteId, title: t("keep_import.root-title"), content: "", type: "text", mime: "text/html", isProtected }).note;
    rootNote.addLabel("iconClass", "bx bx-import");

    for (const parsed of notes) {
        const { note } = noteService.createNewNote({
            parentNoteId: rootNote.noteId,
            title: parsed.title,
            // Keep's exported HTML is external content; sanitize before persisting (this also demotes the
            // `<h1>` Keep uses for its top heading level, which Trilium reserves for the note title).
            content: sanitizeHtml(parsed.content),
            type: "text",
            mime: "text/html",
            isProtected
        });

        // Preserve Keep's original timestamps. Must run after createNewNote's content save, which would
        // otherwise re-stamp the modification date with "now".
        if (parsed.utcDateCreated || parsed.utcDateModified) {
            note.setDateCreatedAndModified(parsed.utcDateCreated, parsed.utcDateModified ?? parsed.utcDateCreated);
        }

        taskContext.increaseProgressCount();
    }

    return rootNote;
}

/** Converts a Keep microsecond-epoch timestamp to Trilium's UTC DB format, or undefined if absent/invalid. */
function usecToUtc(usec: number | undefined): string | undefined {
    if (!usec) {
        return undefined;
    }
    const date = new Date(usec / 1000);
    return Number.isNaN(date.getTime()) ? undefined : dateUtils.utcDateTimeStr(date);
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

export default { importKeep };
