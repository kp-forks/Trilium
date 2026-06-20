// Loading import.ts registers the shared "importNotes" WebSocket toast handlers (progress + success).
// The OneNote import reuses that taskType, but the OneNote dialog never loads import.ts on its own, so
// without this side-effect import the progress/finished toasts would never appear.
import "./import.js";

import server from "./server.js";

export interface OneNoteAccount {
    name: string;
    email: string;
}

export interface OneNoteStatus {
    connected: boolean;
    account: OneNoteAccount | null;
}

export interface OneNoteSection {
    id: string;
    title: string;
}

export interface OneNoteNotebook {
    id: string;
    title: string;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    sections: OneNoteSection[];
}

/** Mirrors `SectionSelection` on the server. */
export interface OneNoteSectionSelection {
    id: string;
    title: string;
    notebookId: string;
    notebookTitle: string;
    notebookCreatedDateTime?: string;
    notebookLastModifiedDateTime?: string;
}

function getAuthUrl() {
    return server.get<{ authUrl: string }>("onenote-import/auth-url");
}

function getStatus() {
    return server.get<OneNoteStatus>("onenote-import/status");
}

function disconnect() {
    return server.post("onenote-import/disconnect");
}

function getNotebooks() {
    return server.get<{ notebooks: OneNoteNotebook[] }>("onenote-import/notebooks");
}

// Kicks off the import and returns as soon as the server has accepted it. The import itself runs in the
// background on the server; progress, completion (navigation to the imported note) and any error all
// arrive over the WebSocket via the shared "importNotes" toast handlers in import.ts.
function runImport(payload: { parentNoteId: string; sections: OneNoteSectionSelection[]; taskId: string; debug?: boolean }) {
    return server.post<void>("onenote-import/import", payload);
}

export default {
    getAuthUrl,
    getStatus,
    disconnect,
    getNotebooks,
    runImport
};
