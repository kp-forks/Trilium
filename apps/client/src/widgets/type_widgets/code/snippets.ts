import type FNote from "../../../entities/fnote.js";
import type LoadResults from "../../../services/load_results.js";
import search from "../../../services/search.js";

export interface CodeSnippet {
    noteId: string;
    title: string;
    description?: string;
    content: string;
}

/**
 * Loads the code snippets (notes carrying `#snippet`) accepted by `matches`, pre-fetching their
 * content and optional `#snippetDescription` so callers can insert them synchronously. The `matches`
 * predicate selects which snippets are relevant to a given editor (e.g. `note.isMarkdown()` for the
 * Markdown editor, or a MIME comparison for a code editor).
 */
export async function getCodeSnippets(matches: (note: FNote) => boolean): Promise<CodeSnippet[]> {
    const notes = (await search.searchForNotes("#snippet")).filter(matches);

    return Promise.all(notes.map(async (note) => ({
        noteId: note.noteId,
        title: note.title,
        description: note.getLabelValue("snippetDescription") ?? undefined,
        content: (await note.getContent()) ?? ""
    })));
}

/**
 * Whether the reloaded entities could change the snippet list — a snippet was created, deleted,
 * retitled, had its description changed, or its content edited. `knownNoteIds` are the note IDs of
 * the snippets currently held by the caller, used to detect content/title edits.
 */
export function isCodeSnippetChange(loadResults: LoadResults, knownNoteIds: Set<string>): boolean {
    const attributeChanged = loadResults.getAttributeRows().some((attr) => {
        if (attr.type === "label") {
            return attr.name === "snippet" || attr.name === "snippetDescription";
        }
        if (attr.type === "relation") {
            return attr.value === "_template_markdown_snippet" || attr.value === "_template_code_snippet";
        }
        return false;
    });

    return attributeChanged || loadResults.getNoteIds().some((noteId) => knownNoteIds.has(noteId));
}
