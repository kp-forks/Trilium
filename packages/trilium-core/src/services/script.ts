import type BNote from "../becca/entities/bnote";

export function executeNoteNoException(script: unknown, { originEntity: unknown }) {
    console.warn("Skipped script execution");
}

export default {
    executeNote(scriptNote: BNote, args: {}) {
        console.warn("Note not executed");
    }
}
