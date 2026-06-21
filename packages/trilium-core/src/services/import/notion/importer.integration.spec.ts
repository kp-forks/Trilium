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

const pageHtml = (title: string, id = "386c5eca1b8b80439520cad27a0d2749") =>
    `<html><head><title>${title}</title></head><body><div id="${id}" class="page"><div class="page-body"><p>Hello</p></div></div></body></html>`;

describe("Notion importer — integration", () => {
    it("nests child pages under the parent named by their containing folder", async () => {
        // Notion names the children folder by title only ("Examples"), while the page file keeps its id.
        const importRoot = await importNotion({
            "Examples 579da56a22844fb9a769e27d53067adc.html": pageHtml("Examples", "579da56a22844fb9a769e27d53067adc"),
            "Examples/Hello world 2c6c5eca1b8b80f7b9eaf4f396b755dc.html": pageHtml("Hello world", "2c6c5eca1b8b80f7b9eaf4f396b755dc"),
            "Examples/Quick Note 3aa38acf20c74649b4370fab0195b882.html": pageHtml("Quick Note", "3aa38acf20c74649b4370fab0195b882")
        });

        const examples = importRoot.getChildNotes().find((note) => note.title === "Examples");
        expect(importRoot.getChildNotes().map((note) => note.title)).toEqual(["Examples"]);
        expect(examples?.getChildNotes().map((note) => note.title).sort()).toEqual(["Hello world", "Quick Note"]);
    });

    it("recurses into a root-level nested export zip (the part Notion makes you extract)", async () => {
        const innerZip = await createZipBuffer({ "Inner page 386c5eca1b8b80439520cad27a0d2749.html": pageHtml("Inner page") });
        const importRoot = await importNotion({ "Export-Part-1.zip": innerZip });

        expect(importRoot.getChildNotes().map((note) => note.title)).toContain("Inner page");
    });

    it("descends through two levels of nested export zips", async () => {
        const innermost = await createZipBuffer({ "Inner page 386c5eca1b8b80439520cad27a0d2749.html": pageHtml("Deep page") });
        const middle = await createZipBuffer({ "Export-Part-1.zip": innermost });
        const importRoot = await importNotion({ "Export.zip": middle });

        expect(importRoot.getChildNotes().map((note) => note.title)).toContain("Deep page");
    });
});
