// Loading import.ts registers the shared "importNotes" WebSocket toast handlers (progress + success).
// The Notion import reuses that taskType, but the import-provider dialog never loads import.ts on its
// own, so without this side-effect import the progress/finished toasts would never appear.
import "./import.js";

import server from "./server.js";
import utils from "./utils.js";

/**
 * Uploads a Notion export zip and returns as soon as the server has accepted it. The import itself runs
 * in the background on the server; progress, completion (navigation to the imported note) and any error
 * all arrive over the WebSocket via the shared "importNotes" toast handlers in import.ts.
 */
async function runImport({ parentNoteId, file }: { parentNoteId: string; file: File }) {
    const formData = new FormData();
    formData.append("upload", file);
    formData.append("parentNoteId", parentNoteId);
    formData.append("taskId", utils.randomString(10));

    await $.ajax({
        url: `${window.glob.baseApiUrl}notion-import/import`,
        headers: await server.getHeaders(),
        data: formData,
        type: "POST",
        timeout: 60 * 60 * 1000,
        contentType: false, // NEEDED, DON'T REMOVE THIS
        processData: false // NEEDED, DON'T REMOVE THIS
    });
}

export default { runImport };
