import { t } from "i18next";

import { ValidationError } from "../errors.js";
import mdExportService from "./export/markdown.js";
import markdownImportService from "./import/markdown.js";
import noteService from "./notes.js";
import type BNote from "../becca/entities/bnote.js";

/** The MIME used for the Markdown note type, matching the note-type registry (`NOTE_TYPES`). */
const MARKDOWN_TARGET_MIME = "text/x-markdown";

type SourceFormat = "html" | "markdown";

interface ConversionResult {
    content: string;
    type: "text" | "code";
    mime: string;
}

/**
 * Pure content + type transform between an HTML text note and a Markdown code note.
 *
 * The direction is determined by `sourceFormat`. This function holds no Becca state, so it
 * can be unit-tested directly. The orchestration (revision, persistence) lives in
 * {@link convertNoteFormat}.
 */
export function convertNoteContent(sourceFormat: SourceFormat, content: string, title: string): ConversionResult {
    if (sourceFormat === "html") {
        return {
            content: mdExportService.toMarkdown(content),
            type: "code",
            mime: MARKDOWN_TARGET_MIME
        };
    }

    return {
        content: markdownImportService.renderToHtml(content, title),
        type: "text",
        mime: "text/html"
    };
}

/**
 * Converts a note in place between an HTML text note and a Markdown code note.
 *
 * A named revision capturing the pre-conversion state is saved first, so the conversion —
 * which is lossy in the HTML→Markdown direction — remains reversible.
 *
 * Must be called within a CLS context (Express routes already provide one).
 */
export function convertNoteFormat(note: BNote): { type: string } {
    const isMarkdown = note.isMarkdown();

    if (note.type !== "text" && !isMarkdown) {
        throw new ValidationError(`Note '${note.noteId}' of type '${note.type}' cannot be converted between HTML and Markdown.`);
    }

    if (!note.isContentAvailable()) {
        throw new ValidationError(`Note '${note.noteId}' content is not available; a protected session may be required.`);
    }

    const content = note.getContent();
    if (typeof content !== "string") {
        throw new ValidationError(`Note '${note.noteId}' does not have textual content.`);
    }

    // Snapshot the current (pre-conversion) state under a descriptive name.
    const description = isMarkdown
        ? t("note_conversion.revision_before_text")
        : t("note_conversion.revision_before_markdown");
    note.saveRevision({ description, source: "manual" });

    const { content: newContent, type, mime } = convertNoteContent(isMarkdown ? "markdown" : "html", content, note.title);

    // Change the type/mime before writing content so type-specific processing (link extraction
    // in `updateNoteData`) runs against the new format.
    note.type = type;
    note.mime = mime;
    note.save();

    noteService.updateNoteData(note.noteId, newContent);

    return { type };
}

export default {
    convertNoteContent,
    convertNoteFormat
};
