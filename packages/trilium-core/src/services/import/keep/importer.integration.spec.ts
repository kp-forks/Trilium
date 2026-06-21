import { ZipArchive } from "archiver";
import { PassThrough } from "stream";
import { describe, expect, it } from "vitest";

import becca from "../../../becca/becca.js";
import type BNote from "../../../becca/entities/bnote.js";
import { getContext } from "../../context.js";
import TaskContext from "../../task_context.js";
import keepImporter from "./importer.js";

/** Builds an in-memory zip from a map of entry name -> contents. */
async function createZipBuffer(files: Record<string, string | Buffer>): Promise<Buffer> {
    const archive = new ZipArchive();
    const chunks: Buffer[] = [];
    const passthrough = new PassThrough();
    passthrough.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.pipe(passthrough);
    for (const [name, content] of Object.entries(files)) {
        archive.append(content, { name });
    }
    await archive.finalize();
    return Buffer.concat(chunks);
}

/** Runs the Keep importer over `files` and returns the single imported note (child of the import root). */
async function importSingleNote(files: Record<string, string>): Promise<BNote> {
    const buffer = await createZipBuffer(files);
    const taskContext = TaskContext.getInstance("keep-integration", "importNotes", { safeImport: true });

    return new Promise<BNote>((resolve, reject) => {
        void getContext().init(async () => {
            try {
                const root = becca.getNoteOrThrow("root");
                const importRoot = await keepImporter.importKeep(taskContext, new Uint8Array(buffer), root);
                const [note] = importRoot.getChildNotes();
                resolve(note);
            } catch (e) {
                reject(e);
            }
        });
    });
}

describe("Google Keep importer — integration", () => {
    it("preserves the original creation and modification dates on the imported note", async () => {
        const note = await importSingleNote({
            "Takeout/Keep/note.json": JSON.stringify({
                title: "Dated note",
                textContent: "hi",
                createdTimestampUsec: 1763069966429000, // 2025-11-13 21:39:26.429Z
                userEditedTimestampUsec: 1782029654353000 // 2026-06-21 08:14:14.353Z
            })
        });

        // The dates must survive createNewNote's "now" stamp (beforeSaving), which setDateCreatedAndModified
        // overrides afterwards.
        expect(note.utcDateCreated).toBe("2025-11-13 21:39:26.429Z");
        expect(note.utcDateModified).toBe("2026-06-21 08:14:14.353Z");
    });

    it("falls the creation date back to the modification date when only the latter is present", async () => {
        const note = await importSingleNote({
            "Takeout/Keep/note.json": JSON.stringify({
                title: "Edited only",
                textContent: "hi",
                userEditedTimestampUsec: 1782029654353000 // 2026-06-21 08:14:14.353Z
            })
        });

        // No created timestamp: rather than leaving the "now" stamp, the modification date is used for both.
        expect(note.utcDateCreated).toBe("2026-06-21 08:14:14.353Z");
        expect(note.utcDateModified).toBe("2026-06-21 08:14:14.353Z");
    });
});
