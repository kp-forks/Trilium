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

    it("groups a CSV-only database's rows under a container note, instead of orphaning them to the root", async () => {
        // A Notion inline/linked database exports as a `.csv` with no sibling `.html`; its rows live in a
        // folder named after the database. Nothing owns that folder, so without a container they'd be flat.
        const importRoot = await importNotion({
            "Reading List 08d361c59a9940c2a9d7237a4e6cd09a.html": pageHtml("Reading List", "08d361c59a9940c2a9d7237a4e6cd09a"),
            "Reading List/Media 0a556b01dd9c4b70bbba51bf2ee0409b.csv": "Title,Author\nx,y",
            "Reading List/Media/Bon Appetit 4f195d8c55fb44f4b94a063e643b0297.html": pageHtml("Bon Appetit", "4f195d8c55fb44f4b94a063e643b0297")
        });

        const readingList = importRoot.getChildNotes().find((note) => note.title === "Reading List");
        const media = readingList?.getChildNotes().find((note) => note.title === "Media");
        expect(media?.getChildNotes().map((note) => note.title)).toEqual(["Bon Appetit"]);
    });

    it("does not create a duplicate container when the database also has its own page", async () => {
        const importRoot = await importNotion({
            "45 cff419ddfc69457aad14bd0381cf0172.html": pageHtml("45", "cff419ddfc69457aad14bd0381cf0172"),
            "45 cff419ddfc69457aad14bd0381cf0172.csv": "a,b\n1,2",
            "45/Brown fox 4731219279d04d78aca408c0a60c4263.html": pageHtml("Brown fox", "4731219279d04d78aca408c0a60c4263")
        });

        const fortyFive = importRoot.getChildNotes().filter((note) => note.title === "45");
        expect(fortyFive.length).toBe(1);
        expect(fortyFive[0].getChildNotes().map((note) => note.title)).toEqual(["Brown fox"]);
    });

    it("saves a referenced file as a role:file attachment and links to it from the content", async () => {
        // Notion exports a file block as <figure><div class="source"><a href="<file>">name</a></figure>,
        // with the file bundled in the zip alongside the page.
        const attachmentFigure = `<figure id="386c5eca-1b8b-808b-84d3-cea5b6510570"><div class="source"><a href="Notes/demo.rtf">demo.rtf</a></div></figure>`;
        const importRoot = await importNotion({
            "Notes 386c5eca1b8b80439520cad27a0d2749.html": `<html><head><title>Notes</title></head><body><div id="386c5eca1b8b80439520cad27a0d2749" class="page"><div class="page-body"><div style="display:contents" dir="ltr">${attachmentFigure}</div></div></div></body></html>`,
            "Notes/demo.rtf": "{\\rtf1 hello}"
        });

        const notes = importRoot.getChildNotes().find((note) => note.title === "Notes");
        if (!notes) {
            throw new Error("imported 'Notes' page not found");
        }
        const attachment = notes.getAttachmentsByRole("file").find((a) => a.title === "demo.rtf");
        expect(attachment).toBeDefined();
        expect(notes.getContent()).toContain(`href="#root/${notes.noteId}?viewMode=attachments&attachmentId=${attachment?.attachmentId}"`);
        expect(notes.getContent()).toContain(`class="reference-link"`);
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
