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

    it("stops descending into nested zips past the depth limit, keeping the innermost as a resource", async () => {
        // depth 0: outer.zip; depth 1: middle.zip; depth 2: innermost.zip — the innermost is at the limit
        // and is kept as a plain resource rather than recursed into, so its page is never imported.
        const innermost = await createZipBuffer({ "Buried 386c5eca1b8b80439520cad27a0d2749.html": pageHtml("Buried page") });
        const middle = await createZipBuffer({ "Export-Part-1.zip": innermost });
        const outer = await createZipBuffer({ "Export.zip": middle });
        const importRoot = await importNotion({ "Outer.zip": outer });

        expect(importRoot.getChildNotes().map((note) => note.title)).not.toContain("Buried page");
    });

    it("skips an explicit directory entry in the zip", async () => {
        const archive = new ZipArchive();
        const chunks: Buffer[] = [];
        const passthrough = new PassThrough();
        passthrough.on("data", (chunk: Buffer) => chunks.push(chunk));
        archive.pipe(passthrough);
        archive.append(Buffer.alloc(0), { name: "Folder/" });
        archive.append(pageHtml("Inside", "2c6c5eca1b8b80f7b9eaf4f396b755dc"), { name: "Folder/Inside 2c6c5eca1b8b80f7b9eaf4f396b755dc.html" });
        await archive.finalize();
        const buffer = Buffer.concat(chunks);

        const taskContext = TaskContext.getInstance("notion-dir-entry", "importNotes", { safeImport: true });
        const importRoot = await new Promise<BNote>((resolve, reject) => {
            void getContext().init(async () => {
                try {
                    resolve(await notionImporter.importNotion(taskContext, new Uint8Array(buffer), becca.getNoteOrThrow("root")));
                } catch (e) {
                    reject(e);
                }
            });
        });

        // The directory entry is skipped; only the real page is imported.
        expect(importRoot.getChildNotes().map((note) => note.title)).toEqual(["Inside"]);
    });

    it("skips index.html without creating a note for it", async () => {
        const importRoot = await importNotion({
            "index.html": `<html><head><title>Index</title></head><body><div id="386c5eca1b8b80439520cad27a0d2749"><div class="page-body"><p>toc</p></div></div></body></html>`,
            "Real page 2c6c5eca1b8b80f7b9eaf4f396b755dc.html": pageHtml("Real page", "2c6c5eca1b8b80f7b9eaf4f396b755dc")
        });

        expect(importRoot.getChildNotes().map((note) => note.title)).toEqual(["Real page"]);
    });

    it("drops a page with no resolvable id (no body id, no id in filename)", async () => {
        const importRoot = await importNotion({
            "Notes.html": `<html><head><title>Notes</title></head><body><div class="page"><div class="page-body"><p>x</p></div></div></body></html>`,
            "Real page 2c6c5eca1b8b80f7b9eaf4f396b755dc.html": pageHtml("Real page", "2c6c5eca1b8b80f7b9eaf4f396b755dc")
        });

        expect(importRoot.getChildNotes().map((note) => note.title)).toEqual(["Real page"]);
    });

    it("falls back to the filename for the title when the page has no <title> tag", async () => {
        const importRoot = await importNotion({
            "My filename title 2c6c5eca1b8b80f7b9eaf4f396b755dc.html":
                `<html><head></head><body><div id="2c6c5eca1b8b80f7b9eaf4f396b755dc"><div class="page-body"><p>x</p></div></div></body></html>`
        });

        expect(importRoot.getChildNotes().map((note) => note.title)).toEqual(["My filename title"]);
    });

    it("falls back to 'Untitled' when there is no <title> and the filename is only an id", async () => {
        const importRoot = await importNotion({
            "2c6c5eca1b8b80f7b9eaf4f396b755dc.html":
                `<html><head></head><body><div id="2c6c5eca1b8b80f7b9eaf4f396b755dc"><div class="page-body"><p>x</p></div></div></body></html>`
        });

        expect(importRoot.getChildNotes().map((note) => note.title)).toEqual(["Untitled"]);
    });

    it("imports an empty content note when the page has no .page-body", async () => {
        const importRoot = await importNotion({
            "Empty 2c6c5eca1b8b80f7b9eaf4f396b755dc.html":
                `<html><head><title>Empty</title></head><body><div id="2c6c5eca1b8b80f7b9eaf4f396b755dc"><p>no page-body wrapper</p></div></body></html>`
        });

        const empty = importRoot.getChildNotes().find((note) => note.title === "Empty");
        expect(empty?.getContent()).toBe("");
    });

    it("rewrites a cross-page link to the linked note as a reference link", async () => {
        const idA = "11111111111111111111111111111111";
        const idB = "22222222222222222222222222222222";
        const importRoot = await importNotion({
            [`Page A ${idA}.html`]:
                `<html><head><title>Page A</title></head><body><div id="${idA}"><div class="page-body"><p><a href="Page B ${idB}.html">Page B</a></p></div></div></body></html>`,
            [`Page B ${idB}.html`]: pageHtml("Page B", idB)
        });

        const pageA = importRoot.getChildNotes().find((note) => note.title === "Page A");
        const pageB = importRoot.getChildNotes().find((note) => note.title === "Page B");
        if (!pageA || !pageB) {
            throw new Error("expected both pages imported");
        }
        expect(pageA.getContent()).toContain(`href="#root/${pageB.noteId}"`);
        expect(pageA.getContent()).toContain(`class="reference-link"`);
    });

    it("leaves a cross-page link to a page that wasn't imported untouched", async () => {
        const idA = "11111111111111111111111111111111";
        const missingId = "99999999999999999999999999999999";
        const importRoot = await importNotion({
            [`Page A ${idA}.html`]:
                `<html><head><title>Page A</title></head><body><div id="${idA}"><div class="page-body"><p><a href="Ghost ${missingId}.html">Ghost</a></p></div></div></body></html>`
        });

        const pageA = importRoot.getChildNotes().find((note) => note.title === "Page A");
        expect(pageA?.getContent()).toContain(`href="Ghost ${missingId}.html"`);
    });

    it("applies a page's single timestamp to both created and modified dates", async () => {
        const id = "2c6c5eca1b8b80f7b9eaf4f396b755dc";
        // Only a created_time row is present; the modified date should fall back to it.
        const propertyTable =
            `<table class="properties"><tbody>` +
            `<tr class="property-row property-row-created_time"><th>Created</th><td><time>2024-01-02T03:04:05Z</time></td></tr>` +
            `</tbody></table>`;
        const importRoot = await importNotion({
            "OneDate 2c6c5eca1b8b80f7b9eaf4f396b755dc.html":
                `<html><head><title>OneDate</title></head><body><div id="${id}">${propertyTable}<div class="page-body"><p>x</p></div></div></body></html>`
        });

        const note = importRoot.getChildNotes().find((n) => n.title === "OneDate");
        expect(note?.utcDateCreated).toBe("2024-01-02 03:04:05.000Z");
        expect(note?.utcDateModified).toBe("2024-01-02 03:04:05.000Z");
    });

    it("uses a page's only last-edited timestamp for its creation date too", async () => {
        const id = "2c6c5eca1b8b80f7b9eaf4f396b755dc";
        // Only a last_edited_time row is present; the created date should fall back to it.
        const propertyTable =
            `<table class="properties"><tbody>` +
            `<tr class="property-row property-row-last_edited_time"><th>Edited</th><td><time>2024-05-06T07:08:09Z</time></td></tr>` +
            `</tbody></table>`;
        const importRoot = await importNotion({
            "EditedOnly 2c6c5eca1b8b80f7b9eaf4f396b755dc.html":
                `<html><head><title>EditedOnly</title></head><body><div id="${id}">${propertyTable}<div class="page-body"><p>x</p></div></div></body></html>`
        });

        const note = importRoot.getChildNotes().find((n) => n.title === "EditedOnly");
        expect(note?.utcDateCreated).toBe("2024-05-06 07:08:09.000Z");
        expect(note?.utcDateModified).toBe("2024-05-06 07:08:09.000Z");
    });

    it("falls back to the file basename for an attachment anchor that has no href", async () => {
        const id = "2c6c5eca1b8b80f7b9eaf4f396b755dc";
        // The converter marks any <figure><div class="source"><a>…</a> as a notion-attachment, even when
        // the anchor carries no href; the importer then resolves an empty path (no bundled file).
        const figure = `<figure id="aaa"><div class="source"><a>orphan</a></div></figure>`;
        const importRoot = await importNotion({
            "NoHref 2c6c5eca1b8b80f7b9eaf4f396b755dc.html":
                `<html><head><title>NoHref</title></head><body><div id="${id}"><div class="page-body"><div style="display:contents" dir="ltr">${figure}</div></div></div></body></html>`
        });

        const note = importRoot.getChildNotes().find((n) => n.title === "NoHref");
        // No bundled file resolved, so the anchor loses its marker class and stays a plain link.
        expect(note?.getContent()).not.toContain("notion-attachment");
        expect(note?.getAttachmentsByRole("file")).toHaveLength(0);
    });

    it("preserves Notion's created/last-edited timestamps from the property table", async () => {
        const id = "2c6c5eca1b8b80f7b9eaf4f396b755dc";
        const propertyTable =
            `<table class="properties"><tbody>` +
            `<tr class="property-row property-row-created_time"><th>Created</th><td><time>2024-01-02T03:04:05Z</time></td></tr>` +
            `<tr class="property-row property-row-last_edited_time"><th>Edited</th><td><time>2024-05-06T07:08:09Z</time></td></tr>` +
            `</tbody></table>`;
        const importRoot = await importNotion({
            "Dated 2c6c5eca1b8b80f7b9eaf4f396b755dc.html":
                `<html><head><title>Dated</title></head><body><div id="${id}">${propertyTable}<div class="page-body"><p>x</p></div></div></body></html>`
        });

        const dated = importRoot.getChildNotes().find((note) => note.title === "Dated");
        expect(dated?.utcDateCreated).toBe("2024-01-02 03:04:05.000Z");
        expect(dated?.utcDateModified).toBe("2024-05-06 07:08:09.000Z");
    });

    it("ignores property-row dates that are blank or unparseable", async () => {
        const id = "2c6c5eca1b8b80f7b9eaf4f396b755dc";
        const propertyTable =
            `<table class="properties"><tbody>` +
            `<tr class="property-row property-row-created_time"><th>Created</th><td><time></time></td></tr>` +
            `<tr class="property-row property-row-last_edited_time"><th>Edited</th><td><time>not a date</time></td></tr>` +
            `</tbody></table>`;
        const importRoot = await importNotion({
            "Undated 2c6c5eca1b8b80f7b9eaf4f396b755dc.html":
                `<html><head><title>Undated</title></head><body><div id="${id}">${propertyTable}<div class="page-body"><p>x</p></div></div></body></html>`
        });

        // No timestamps were applied, so the note keeps a fresh (recent) creation date, not 2024.
        const undated = importRoot.getChildNotes().find((note) => note.title === "Undated");
        expect(undated?.utcDateCreated.startsWith("2024-01-02")).toBe(false);
    });

    it("imports a page's text property as a Trilium label", async () => {
        const id = "2c6c5eca1b8b80f7b9eaf4f396b755dc";
        // Real Notion markup: the <th> leads with an icon span (no text) before the column name.
        const propertyTable =
            `<table class="properties"><tbody>` +
            `<tr class="property-row property-row-text"><th><span class="icon property-icon"><img src="x.svg"/></span>Text column</th><td>Basic text</td></tr>` +
            `</tbody></table>`;
        const importRoot = await importNotion({
            "Texty 2c6c5eca1b8b80f7b9eaf4f396b755dc.html":
                `<html><head><title>Texty</title></head><body><div id="${id}">${propertyTable}<div class="page-body"><p>x</p></div></div></body></html>`
        });

        const note = importRoot.getChildNotes().find((n) => n.title === "Texty");
        // The column name is sanitized (space → underscore, case preserved); the value is kept verbatim.
        expect(note?.getOwnedLabelValue("Text_column")).toBe("Basic text");
    });

    it("sanitizes illegal characters in a text property's name and skips blank values", async () => {
        const id = "2c6c5eca1b8b80f7b9eaf4f396b755dc";
        const propertyTable =
            `<table class="properties"><tbody>` +
            `<tr class="property-row property-row-text"><th>Sub-title (v2)</th><td>Hello world</td></tr>` +
            `<tr class="property-row property-row-text"><th>Empty</th><td></td></tr>` +
            `</tbody></table>`;
        const importRoot = await importNotion({
            "Mixed 2c6c5eca1b8b80f7b9eaf4f396b755dc.html":
                `<html><head><title>Mixed</title></head><body><div id="${id}">${propertyTable}<div class="page-body"><p>x</p></div></div></body></html>`
        });

        const note = importRoot.getChildNotes().find((n) => n.title === "Mixed");
        // Every char outside [\p{L}\p{N}_:] becomes an underscore: "Sub-title (v2)" → "Sub_title__v2_".
        expect(note?.getOwnedLabelValue("Sub_title__v2_")).toBe("Hello world");
        // The blank-valued row contributes no label.
        expect(note?.hasOwnedLabel("Empty")).toBe(false);
    });

    it("saves a bundled image as an attachment and rewrites its src; leaves external/srcless images alone", async () => {
        const id = "2c6c5eca1b8b80f7b9eaf4f396b755dc";
        const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const body =
            `<div class="page-body">` +
            `<figure class="image"><img src="pic.png"></figure>` +
            `<figure class="image"><img></figure>` +
            `<figure class="image"><img src="https://external/x.png"></figure>` +
            `</div>`;
        const importRoot = await importNotion({
            "Img 2c6c5eca1b8b80f7b9eaf4f396b755dc.html":
                `<html><head><title>Img</title></head><body><div id="${id}">${body}</div></body></html>`,
            "pic.png": pngBytes
        });

        const note = importRoot.getChildNotes().find((n) => n.title === "Img");
        if (!note) {
            throw new Error("expected 'Img' page imported");
        }
        const attachment = note.getAttachments().find((a) => a.role === "image");
        expect(attachment).toBeDefined();
        expect(note.getContent()).toContain("api/attachments/");
        expect(note.getContent()).toContain("https://external/x.png");
    });

    it("handles attachment edge cases: missing file, empty text, unknown extension", async () => {
        const id = "2c6c5eca1b8b80f7b9eaf4f396b755dc";
        // The converter turns <figure><div class="source"><a href=…>…</a></div></figure> into a
        // notion-attachment anchor. Three figures: a missing file, an empty-text anchor, an unknown ext.
        const figures =
            `<figure id="aaa"><div class="source"><a href="missing.bin">x</a></div></figure>` +
            `<figure id="bbb"><div class="source"><a href="empty.weird"></a></div></figure>` +
            `<figure id="ccc"><div class="source"><a href="data.weird">label</a></div></figure>`;
        const importRoot = await importNotion({
            "Files 2c6c5eca1b8b80f7b9eaf4f396b755dc.html":
                `<html><head><title>Files</title></head><body><div id="${id}"><div class="page-body"><div style="display:contents" dir="ltr">${figures}</div></div></div></body></html>`,
            "empty.weird": Buffer.from("e"),
            "data.weird": Buffer.from("d")
        });

        const note = importRoot.getChildNotes().find((n) => n.title === "Files");
        if (!note) {
            throw new Error("expected 'Files' page imported");
        }
        const fileAttachments = note.getAttachmentsByRole("file");
        // Missing file: stays a plain link, no attachment; empty-text + unknown-ext: two attachments.
        expect(fileAttachments.map((a) => a.title).sort()).toEqual(["empty.weird", "label"]);
        const octetStream = fileAttachments.find((a) => a.title === "label");
        expect(octetStream?.mime).toBe("application/octet-stream");
        // The missing-file anchor lost its marker class but is still a plain link.
        expect(note.getContent()).toContain(`href="missing.bin"`);
        expect(note.getContent()).not.toContain("notion-attachment");
    });

    it("synthesizes a 'Database' container for a CSV whose name strips to an empty title", async () => {
        // A CSV named with only a Notion id strips to an empty title and has no owning page, so the
        // container falls back to the "Database" name. Its rows live in the id-named sibling folder.
        const dbId = "08d361c59a9940c2a9d7237a4e6cd09a";
        const importRoot = await importNotion({
            [`${dbId}.csv`]: "a,b\n1,2",
            [`${dbId}/Row 4f195d8c55fb44f4b94a063e643b0297.html`]: pageHtml("Row", "4f195d8c55fb44f4b94a063e643b0297")
        });

        const container = importRoot.getChildNotes().find((note) => note.title === "Database");
        expect(container).toBeDefined();
        expect(container?.getChildNotes().map((note) => note.title)).toEqual(["Row"]);
    });

    it("synthesizes a container named after a CSV that carries no Notion id", async () => {
        // A CSV with no id at all keeps its (non-empty) filename as the container title and an empty id.
        const importRoot = await importNotion({
            "Inventory.csv": "a,b\n1,2",
            "Inventory/Widget 4f195d8c55fb44f4b94a063e643b0297.html": pageHtml("Widget", "4f195d8c55fb44f4b94a063e643b0297")
        });

        const container = importRoot.getChildNotes().find((note) => note.title === "Inventory");
        expect(container).toBeDefined();
        expect(container?.getChildNotes().map((note) => note.title)).toEqual(["Widget"]);
    });
});
