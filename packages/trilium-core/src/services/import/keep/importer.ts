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
    /** Note background colour, one of Keep's named palette entries ("DEFAULT" for none). */
    color?: string;
    /** Creation/last-edit timestamps, in microseconds since the Unix epoch. */
    createdTimestampUsec?: number;
    userEditedTimestampUsec?: number;
}

interface ParsedNote {
    title: string;
    /** Body HTML; empty when the note has neither text nor list content. */
    content: string;
    /** Hex colour for Trilium's `#color` label, or undefined for Keep's default (no colour). */
    colorHex?: string;
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

    // Untitled Keep notes export with an empty `title`; fall back to a readable title derived from the
    // timestamp filename.
    const title = note.title?.trim() || formatUntitledTitle(removeExtension(baseName(path)));

    return {
        title,
        content: buildContent(note),
        colorHex: keepColorToHex(note.color),
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

        if (parsed.colorHex) {
            note.addLabel("color", parsed.colorHex);
        }

        // Preserve Keep's original timestamps. Must run after createNewNote's content save, which would
        // otherwise re-stamp the modification date with "now".
        if (parsed.utcDateCreated || parsed.utcDateModified) {
            note.setDateCreatedAndModified(parsed.utcDateCreated, parsed.utcDateModified ?? parsed.utcDateCreated);
        }

        taskContext.increaseProgressCount();
    }

    return rootNote;
}

/**
 * Keep's named note colours mapped to their exact palette hex (taken from the colour classes in Keep's own
 * exported `.html`). "DEFAULT" (no colour) is intentionally absent.
 */
const KEEP_COLOR_HEX: Record<string, string> = {
    RED: "#ff6d3f",
    ORANGE: "#ff9b00",
    YELLOW: "#ffda00",
    GREEN: "#95d641",
    TEAL: "#1ce8b5",
    BLUE: "#3fc3ff",
    CERULEAN: "#82b1ff",
    PURPLE: "#b388ff",
    PINK: "#f8bbd0",
    BROWN: "#d7ccc8",
    GRAY: "#b8c4c9"
};

/** Maps a Keep note colour to its Trilium `#color` hex, or undefined for the default/unknown/missing colour. */
function keepColorToHex(color: string | undefined): string | undefined {
    return color ? KEEP_COLOR_HEX[color.toUpperCase()] : undefined;
}

/** Converts a Keep microsecond-epoch timestamp to Trilium's UTC DB format, or undefined if absent/invalid. */
function usecToUtc(usec: number | undefined): string | undefined {
    if (!usec) {
        return undefined;
    }
    const date = new Date(usec / 1000);
    return Number.isNaN(date.getTime()) ? undefined : dateUtils.utcDateTimeStr(date);
}

/**
 * Builds a readable title for an untitled note from its filename. Keep names untitled notes by their
 * timestamp with the local-time offset baked in (e.g. "2026-06-21T11_14_14.438+03_00"); reformat that to
 * "2026-06-21 11:14:14" — the digits before the offset are already local, so no conversion is needed.
 * Non-timestamp names are returned as-is, and an empty name falls back to "Untitled".
 */
function formatUntitledTitle(name: string): string {
    const match = name.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})_(\d{2})_(\d{2})/);
    if (match) {
        const [, date, hour, minute, second] = match;
        return `${date} ${hour}:${minute}:${second}`;
    }
    return name || "Untitled";
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
