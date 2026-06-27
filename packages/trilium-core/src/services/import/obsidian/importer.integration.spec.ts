import { ZipArchive } from "archiver";
import { PassThrough } from "stream";
import { describe, expect, it } from "vitest";

import becca from "../../../becca/becca.js";
import type BNote from "../../../becca/entities/bnote.js";
import { getContext } from "../../context.js";
import TaskContext from "../../task_context.js";
import obsidianImporter from "./importer.js";

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

/** Runs the Obsidian importer over `files` and returns the import root note. */
async function importObsidian(files: Record<string, string | Buffer>, fileName?: string): Promise<BNote> {
    const buffer = await createZipBuffer(files);
    const taskContext = TaskContext.getInstance("obsidian-integration", "importNotes", { safeImport: true });

    return new Promise<BNote>((resolve, reject) => {
        void getContext().init(async () => {
            try {
                const root = becca.getNoteOrThrow("root");
                resolve(await obsidianImporter.importObsidian(taskContext, new Uint8Array(buffer), root, fileName));
            } catch (e) {
                reject(e);
            }
        });
    });
}

describe("Obsidian importer — integration", () => {
    // Scaffold only: structure/content processing (folders → notes, Markdown → HTML, links, …) is not wired
    // up yet, so for now the importer just creates the import root. These assertions lock in that contract.
    it("creates an 'Obsidian import' text root with an import icon", async () => {
        const importRoot = await importObsidian({
            "Welcome.md": "# Welcome\n\nFirst note.",
            "Folder/Nested.md": "Nested note."
        });

        expect(importRoot.title).toBe("Obsidian import");
        expect(importRoot.type).toBe("text");
        expect(importRoot.getOwnedLabelValue("iconClass")).toBe("bx bx-import");
    });

    it("does not import any notes yet (processing arrives in a later pass)", async () => {
        const importRoot = await importObsidian({ "Note.md": "body" }, "My Vault.zip");

        expect(importRoot.getChildNotes()).toHaveLength(0);
    });
});
