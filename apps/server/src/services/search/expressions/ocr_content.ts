import becca from "../../../becca/becca.js";
import NoteSet from "../note_set.js";
import type SearchContext from "../search_context.js";
import Expression from "./expression.js";

/**
 * Search expression for finding text within OCR-extracted content (textRepresentation)
 * from image notes and their attachments.
 */
export default class OCRContentExpression extends Expression {
    private tokens: string[];

    constructor(tokens: string[]) {
        super();
        this.tokens = tokens;
    }

    execute(inputNoteSet: NoteSet, executionContext: object, searchContext: SearchContext): NoteSet {
        const resultNoteSet = new NoteSet();

        for (const note of inputNoteSet.notes) {
            if (this.noteMatchesOCR(note.noteId)) {
                resultNoteSet.add(note);
            }
        }

        if (resultNoteSet.notes.length > 0) {
            const highlightTokens = this.tokens
                .filter(token => token.length > 2)
                .map(token => token.toLowerCase());
            searchContext.highlightedTokens.push(...highlightTokens);
        }

        return resultNoteSet;
    }

    /**
     * Check if a note (or its attachments) has OCR text matching all tokens.
     */
    private noteMatchesOCR(noteId: string): boolean {
        const note = becca.notes[noteId];
        if (!note) return false;

        // Collect all textRepresentation values for this note
        const texts: string[] = [];

        const noteBlob = becca.getBlob({ blobId: note.blobId });
        if (noteBlob?.textRepresentation) {
            texts.push(noteBlob.textRepresentation.toLowerCase());
        }

        for (const attachment of note.getAttachments()) {
            const blob = becca.getBlob({ blobId: attachment.blobId });
            if (blob?.textRepresentation) {
                texts.push(blob.textRepresentation.toLowerCase());
            }
        }

        if (texts.length === 0) return false;

        // All tokens must appear in at least one of the text representations
        const combined = texts.join(" ");
        return this.tokens.every(token => combined.includes(token.toLowerCase()));
    }

    toString(): string {
        return `OCRContent('${this.tokens.join("', '")}')`;
    }
}
