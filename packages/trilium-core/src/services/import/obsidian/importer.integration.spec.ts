import { ZipArchive } from "archiver";
import { PassThrough } from "stream";
import { describe, expect, it } from "vitest";

import becca from "../../../becca/becca.js";
import type BNote from "../../../becca/entities/bnote.js";
import { getContext } from "../../context.js";
import TaskContext from "../../task_context.js";
import { decodeUtf8 } from "../../utils/binary.js";
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
    it("creates an 'Obsidian import' text root with an import icon", async () => {
        const importRoot = await importObsidian({ "Note.md": "body" });

        expect(importRoot.title).toBe("Obsidian import");
        expect(importRoot.type).toBe("text");
        expect(importRoot.getOwnedLabelValue("iconClass")).toBe("bx bx-import");
    });

    it("mirrors the vault folder structure, rendering each note's Markdown to HTML", async () => {
        const importRoot = await importObsidian({
            "Welcome.md": "This is your new *vault*.",
            "Folder 1/First note.md": "Content goes here.",
            "Folder 2/Folder 2 Note.md": "Nested content."
        });

        // The root holds the top-level note plus one container note per folder, named after the folder.
        const children = importRoot.getChildNotes();
        expect(children.map((n) => n.title)).toEqual(["Folder 1", "Folder 2", "Welcome"]);

        // Each folder note holds its notes; the Markdown body is rendered to HTML.
        const folder1 = children.find((n) => n.title === "Folder 1");
        expect(folder1?.getChildNotes().map((n) => n.title)).toEqual(["First note"]);
        expect(decodeUtf8(folder1?.getChildNotes()[0]?.getContent() ?? "")).toBe("<p>Content goes here.</p>");

        const welcome = children.find((n) => n.title === "Welcome");
        expect(decodeUtf8(welcome?.getContent() ?? "")).toBe("<p>This is your new <em>vault</em>.</p>");
    });

    it("drops attachments, the .base/.canvas files and the .obsidian config folder", async () => {
        const importRoot = await importObsidian({
            "Note.md": "Body.",
            "Screenshot.png": Buffer.from("\x89PNG\r\n\x1a\nfake"),
            "Untitled.base": "filters: {}",
            "Untitled.canvas": "{}",
            ".obsidian/app.json": "{}",
            ".obsidian/workspace.json": "{}"
        });

        // Only the Markdown note is imported; nothing else creates a note.
        expect(importRoot.getChildNotes().map((n) => n.title)).toEqual(["Note"]);
    });

    it("strips the wrapper folder and names the root after the vault when the outer folder is zipped", async () => {
        // `.obsidian/` sits under "Test vault/", so that folder is the vault root and must be stripped.
        const importRoot = await importObsidian({
            "Test vault/Welcome.md": "Hi.",
            "Test vault/Folder 1/First note.md": "Content goes here.",
            "Test vault/.obsidian/app.json": "{}"
        });

        expect(importRoot.title).toBe("Test vault");
        expect(importRoot.getChildNotes().map((n) => n.title)).toEqual(["Folder 1", "Welcome"]);
        const folder1 = importRoot.getChildNotes().find((n) => n.title === "Folder 1");
        expect(folder1?.getChildNotes().map((n) => n.title)).toEqual(["First note"]);
    });

    it("names the root from the zip filename when the vault contents are zipped directly", async () => {
        // `.obsidian/` is at the zip root, so nothing is stripped; the name comes from the zip file.
        const importRoot = await importObsidian({ "Welcome.md": "Hi.", ".obsidian/app.json": "{}" }, "My Vault.zip");

        expect(importRoot.title).toBe("My Vault");
        expect(importRoot.getChildNotes().map((n) => n.title)).toEqual(["Welcome"]);
    });

    it("falls back to stripping a single shared wrapper folder when there is no .obsidian", async () => {
        const importRoot = await importObsidian({ "Wrapper/A.md": "a", "Wrapper/B.md": "b" });

        expect(importRoot.title).toBe("Wrapper");
        expect(importRoot.getChildNotes().map((n) => n.title)).toEqual(["A", "B"]);
    });

    it("imports image embeds as image attachments and non-image embeds as file reference links", async () => {
        const importRoot = await importObsidian({
            "Attachment test.md": "![[shot.png]]\n\n![[doc.rtf]]",
            "shot.png": Buffer.from("\x89PNG\r\n\x1a\nfake-png"),
            "doc.rtf": Buffer.from("{\\rtf1 hello}"),
            ".obsidian/app.json": "{}"
        }, "Vault.zip");

        const note = importRoot.getChildNotes().find((n) => n.title === "Attachment test");
        if (!note) {
            throw new Error("note was not imported");
        }
        const content = decodeUtf8(note.getContent());

        // The image embed becomes a role:image attachment, its <img> src rewritten to point at it.
        const images = note.getAttachmentsByRole("image");
        expect(images.map((a) => a.title)).toEqual(["shot.png"]);
        expect(content).toContain(`<img src="api/attachments/${images[0]?.attachmentId}/image/`);
        expect(content).not.toContain(`src="/shot.png"`);

        // The non-image embed becomes a role:file attachment with a reference link.
        const files = note.getAttachmentsByRole("file");
        expect(files.map((a) => a.title)).toEqual(["doc.rtf"]);
        expect(content).toContain(`class="reference-link"`);
        expect(content).toContain(`attachmentId=${files[0]?.attachmentId}`);
        expect(content).not.toContain("/doc.rtf");
    });

    it("resolves an embed by name even when the attachment lives in a different folder", async () => {
        const importRoot = await importObsidian({
            "Notes/Page.md": "![[pic.png]]",
            "Assets/pic.png": Buffer.from("\x89PNG\r\n\x1a\nfake")
        });

        const page = importRoot.getChildNotes().find((n) => n.title === "Notes")?.getChildNotes()[0];
        expect(page?.getAttachmentsByRole("image").map((a) => a.title)).toEqual(["pic.png"]);
    });

    it("leaves note embeds and non-imported targets untouched (handled by later passes)", async () => {
        const importRoot = await importObsidian({
            "Note.md": "![[Other note]]\n\n![[Untitled.base]]",
            "Other note.md": "I am a note.",
            "Untitled.base": "filters: {}"
        });

        const note = importRoot.getChildNotes().find((n) => n.title === "Note");
        // Neither a note embed nor a .base resolves to an attachment, so nothing is saved in this pass.
        expect(note?.getAttachmentsByRole("image")).toHaveLength(0);
        expect(note?.getAttachmentsByRole("file")).toHaveLength(0);
    });

    it("resolves a wikilink to a reference link and records an internalLink relation (backlink)", async () => {
        const importRoot = await importObsidian({ "A.md": "See [[B]].", "B.md": "I am B." });

        const a = importRoot.getChildNotes().find((n) => n.title === "A");
        const b = importRoot.getChildNotes().find((n) => n.title === "B");
        if (!a || !b) {
            throw new Error("notes were not imported");
        }

        // The link resolves to a reference link (the live-title chip) pointing at B.
        expect(decodeUtf8(a.getContent())).toContain(`<a class="reference-link" href="#root/${b.noteId}">`);
        // ...and drives backlinks both ways.
        expect(a.getRelations().filter((r) => r.name === "internalLink").map((r) => r.value)).toEqual([b.noteId]);
        expect(b.getTargetRelations().filter((r) => r.name === "internalLink").map((r) => r.noteId)).toEqual([a.noteId]);
    });

    it("uses the alias as the link text for [[Target|alias]]", async () => {
        const importRoot = await importObsidian({ "A.md": "[[B|the bee]]", "B.md": "b" });

        const a = importRoot.getChildNotes().find((n) => n.title === "A");
        const b = importRoot.getChildNotes().find((n) => n.title === "B");
        const content = decodeUtf8(a?.getContent() ?? "");
        // An aliased link is a plain internal link carrying the alias text, not a live-title reference link.
        expect(content).toContain(`<a href="#root/${b?.noteId}">the bee</a>`);
        expect(content).not.toContain("reference-link");
    });

    it("resolves a path-qualified wikilink even when the base name is ambiguous", async () => {
        const importRoot = await importObsidian({
            "Linker.md": "[[Folder 1/Note]]",
            "Folder 1/Note.md": "one",
            "Folder 2/Note.md": "two"
        });

        const linker = importRoot.getChildNotes().find((n) => n.title === "Linker");
        const target = importRoot.getChildNotes().find((n) => n.title === "Folder 1")?.getChildNotes()[0];
        expect(decodeUtf8(linker?.getContent() ?? "")).toContain(`href="#root/${target?.noteId}"`);
    });

    it("unwraps unresolvable and ambiguous wikilinks to plain text, recording no relation", async () => {
        const importRoot = await importObsidian({
            "Missing.md": "Go to [[Nowhere]].",
            "Ambiguous.md": "[[Dup]]",
            "Folder 1/Dup.md": "one",
            "Folder 2/Dup.md": "two"
        });

        const missing = importRoot.getChildNotes().find((n) => n.title === "Missing");
        expect(decodeUtf8(missing?.getContent() ?? "")).toBe("<p>Go to Nowhere.</p>");
        expect(missing?.getRelations().filter((r) => r.name === "internalLink")).toHaveLength(0);

        // "Dup" is shared by two notes, so it's ambiguous and left unresolved rather than guessed.
        const ambiguous = importRoot.getChildNotes().find((n) => n.title === "Ambiguous");
        expect(decodeUtf8(ambiguous?.getContent() ?? "")).toBe("<p>Dup</p>");
        expect(ambiguous?.getRelations().filter((r) => r.name === "internalLink")).toHaveLength(0);
    });
});
