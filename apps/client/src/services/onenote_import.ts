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
    sections: OneNoteSection[];
}

/** Mirrors `SectionSelection` on the server. */
export interface OneNoteSectionSelection {
    id: string;
    title: string;
    notebookTitle: string;
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

function runImport(payload: { parentNoteId: string; sections: OneNoteSectionSelection[]; taskId: string }) {
    return server.post<{ noteId: string }>("onenote-import/import", payload);
}

export default {
    getAuthUrl,
    getStatus,
    disconnect,
    getNotebooks,
    runImport
};
