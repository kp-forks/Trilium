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
async function importSingleNote(files: Record<string, string | Buffer>): Promise<BNote> {
    const [note] = await importNotes(files);

    return note;
}

/** Runs the Keep importer over `files` and returns every imported note (children of the import root). */
async function importNotes(files: Record<string, string | Buffer>): Promise<BNote[]> {
    const buffer = await createZipBuffer(files);
    const taskContext = TaskContext.getInstance("keep-integration", "importNotes", { safeImport: true });

    return new Promise<BNote[]>((resolve, reject) => {
        void getContext().init(async () => {
            try {
                const root = becca.getNoteOrThrow("root");
                const importRoot = await keepImporter.importKeep(taskContext, new Uint8Array(buffer), root);
                resolve(importRoot.getChildNotes());
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

    it("falls the modification date back to the creation date when only the former is present", async () => {
        const note = await importSingleNote({
            "Takeout/Keep/note.json": JSON.stringify({
                title: "Created only",
                textContent: "hi",
                createdTimestampUsec: 1763069966429000 // 2025-11-13 21:39:26.429Z
            })
        });

        // No modified timestamp: the creation date is used for both.
        expect(note.utcDateCreated).toBe("2025-11-13 21:39:26.429Z");
        expect(note.utcDateModified).toBe("2025-11-13 21:39:26.429Z");
    });

    it("imports only the .json notes, skipping the redundant .html/.txt and Labels.txt entries", async () => {
        const notes = await importNotes({
            "Takeout/Keep/note.json": JSON.stringify({ title: "Real note", textContent: "hi" }),
            "Takeout/Keep/note.html": "<html><body>redundant</body></html>",
            "Takeout/Keep/note.txt": "redundant plain text",
            "Takeout/Keep/Labels.txt": "Shopping\nWork",
            "Takeout/Keep/sub/": Buffer.alloc(0)
        });

        expect(notes).toHaveLength(1);
        expect(notes[0].title).toBe("Real note");
    });

    it("skips a malformed .json entry without failing the import", async () => {
        const notes = await importNotes({
            "Takeout/Keep/good.json": JSON.stringify({ title: "Good", textContent: "hi" }),
            "Takeout/Keep/bad.json": "{ not valid json"
        });

        expect(notes).toHaveLength(1);
        expect(notes[0].title).toBe("Good");
    });

    it("applies the Keep palette colour as a #color label on the imported note", async () => {
        const note = await importSingleNote({
            "Takeout/Keep/note.json": JSON.stringify({ title: "Green note", textContent: "hi", color: "GREEN" })
        });

        expect(note.getOwnedLabelValue("color")).toBe("#95d641");
    });
});
