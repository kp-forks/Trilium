import { ZipArchive } from "archiver";
import { PassThrough } from "stream";
import { describe, expect, it } from "vitest";

import becca from "../../../becca/becca.js";
import type BNote from "../../../becca/entities/bnote.js";
import { getContext } from "../../context.js";
import TaskContext from "../../task_context.js";
import notionImporter from "./importer.js";

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

/** Runs the Notion importer over `files` and returns the import root note. */
async function importNotion(files: Record<string, string | Buffer>): Promise<BNote> {
    const buffer = await createZipBuffer(files);
    const taskContext = TaskContext.getInstance("notion-integration", "importNotes", { safeImport: true });

    return new Promise<BNote>((resolve, reject) => {
        void getContext().init(async () => {
            try {
                const root = becca.getNoteOrThrow("root");
                resolve(await notionImporter.importNotion(taskContext, new Uint8Array(buffer), root));
            } catch (e) {
                reject(e);
            }
        });
    });
}

const pageHtml = (title: string) =>
    `<html><head><title>${title}</title></head><body><div id="386c5eca1b8b80439520cad27a0d2749" class="page"><div class="page-body"><p>Hello</p></div></div></body></html>`;

describe("Notion importer — integration", () => {
    it("recurses into a root-level nested export zip (the part Notion makes you extract)", async () => {
        const innerZip = await createZipBuffer({ "Inner page 386c5eca1b8b80439520cad27a0d2749.html": pageHtml("Inner page") });
        const importRoot = await importNotion({ "Export-Part-1.zip": innerZip });

        expect(importRoot.getChildNotes().map((note) => note.title)).toContain("Inner page");
    });

    it("descends into a nested export zip even when it sits inside a top-level wrapper folder", async () => {
        const innerZip = await createZipBuffer({ "Inner page 386c5eca1b8b80439520cad27a0d2749.html": pageHtml("Wrapped page") });
        const importRoot = await importNotion({ "My Export/Export-Part-1.zip": innerZip });

        expect(importRoot.getChildNotes().map((note) => note.title)).toContain("Wrapped page");
    });

    it("descends through two levels of nested export zips", async () => {
        const innermost = await createZipBuffer({ "Inner page 386c5eca1b8b80439520cad27a0d2749.html": pageHtml("Deep page") });
        const middle = await createZipBuffer({ "Export-Part-1.zip": innermost });
        const importRoot = await importNotion({ "Export.zip": middle });

        expect(importRoot.getChildNotes().map((note) => note.title)).toContain("Deep page");
    });
});
