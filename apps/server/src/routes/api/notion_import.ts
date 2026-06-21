/**
 * REST endpoint for the Notion importer. Accepts a multipart upload of a Notion HTML-export zip and
 * kicks off the structural import in the background, reporting progress over the WebSocket via the
 * shared "importNotes" task type.
 *
 *   POST /api/notion-import/import  (multipart: `upload` = .zip, `parentNoteId`, `taskId`)  -> {}
 */

import { becca, ValidationError } from "@triliumnext/core";
import type { Request } from "express";

import importer from "../../services/import/notion/importer.js";

function runImport(req: Request) {
    const { parentNoteId, taskId } = req.body as { parentNoteId?: string; taskId?: string };
    if (!parentNoteId || !taskId) {
        throw new ValidationError("parentNoteId and taskId are required.");
    }

    const file = req.file;
    if (!file || typeof file.buffer === "string") {
        throw new ValidationError("No zip file has been uploaded.");
    }

    becca.getNoteOrThrow(parentNoteId);

    // Fire-and-forget: a large export can take far longer than the client's HTTP request timeout, so we
    // return immediately and let the import report progress, completion and any error over the WebSocket
    // (taskType "importNotes"). importZip catches and reports its own failures, so it never rejects here.
    void importer.importZip({ fileBuffer: file.buffer, parentNoteId, taskId });
    return {};
}

export default { runImport };
