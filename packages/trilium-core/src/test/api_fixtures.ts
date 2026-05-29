import { CoreApiTester } from "./api_tester";

export interface CreatedNote {
    noteId: string;
    branchId: string;
}

interface CreateNoteOptions {
    parentNoteId?: string;
    title?: string;
    content?: string;
}

/**
 * Creates a disposable child note through the core API and returns its
 * `{ noteId, branchId }`, so tests can operate on a known note without
 * coupling to specific fixture content.
 */
export async function createTextNote(
    api: CoreApiTester,
    { parentNoteId = "root", title = "Test note", content = "<p>hello</p>" }: CreateNoteOptions = {}
): Promise<CreatedNote> {
    const res = await api.post<{ note: { noteId: string }; branch: { branchId: string } }>(
        `/api/notes/${parentNoteId}/children?target=into`,
        { body: { title, type: "text", content } }
    );

    return {
        noteId: res.body.note.noteId,
        branchId: res.body.branch.branchId
    };
}
