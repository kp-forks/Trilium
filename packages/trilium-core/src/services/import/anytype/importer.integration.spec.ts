import { ZipArchive } from "archiver";
import { PassThrough } from "stream";
import { describe, expect, it } from "vitest";

import becca from "../../../becca/becca.js";
import type BNote from "../../../becca/entities/bnote.js";
import { getContext } from "../../context.js";
import TaskContext from "../../task_context.js";
import { decodeUtf8 } from "../../utils/binary.js";
import anytypeImporter from "./importer.js";

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

/** Runs the Anytype importer over `files` and returns the import root note. */
async function importAnytype(files: Record<string, string | Buffer>): Promise<BNote> {
    const buffer = await createZipBuffer(files);
    const taskContext = TaskContext.getInstance("anytype-integration", "importNotes", { safeImport: true });

    return new Promise<BNote>((resolve, reject) => {
        void getContext().init(async () => {
            try {
                const root = becca.getNoteOrThrow("root");
                resolve(await anytypeImporter.importAnytype(taskContext, new Uint8Array(buffer), root));
            } catch (e) {
                reject(e);
            }
        });
    });
}

/** Serializes a page object the way Anytype's JSON export does: a root block with header chrome plus one
 * text block per paragraph, and the title carried in `details.name`. */
function pageObject(id: string, name: string, paragraphs: string[], opts: { layout?: number; sbType?: string } = {}): string {
    const contentIds = paragraphs.map((_, i) => `${id}-b${i}`);
    return JSON.stringify({
        sbType: opts.sbType ?? "Page",
        snapshot: {
            data: {
                blocks: [
                    { id, childrenIds: ["header", ...contentIds] },
                    { id: "header", childrenIds: ["title"] },
                    { id: "title", text: { text: "", style: "Title" } },
                    ...paragraphs.map((text, i) => ({ id: contentIds[i], text: { text, style: "Paragraph" } }))
                ],
                details: { id, name, layout: opts.layout ?? 0 },
                objectTypes: ["ot-page"]
            }
        }
    });
}

describe("Anytype importer — integration", () => {
    it("imports each page as a flat child of an 'Anytype import' root, with its text content", async () => {
        const importRoot = await importAnytype({
            "objects/page1.pb.json": pageObject("page1", "First Page", ["Hello world", "Second paragraph"]),
            "objects/page2.pb.json": pageObject("page2", "Second Page", ["Just one line"])
        });

        expect(importRoot.title).toBe("Anytype import");

        const children = importRoot.getChildNotes();
        expect(children.map((note) => note.title).sort()).toEqual(["First Page", "Second Page"]);

        const first = children.find((note) => note.title === "First Page");
        expect(decodeUtf8(first?.getContent() ?? "")).toBe("<p>Hello world</p><p>Second paragraph</p>");
    });

    it("imports only pages, skipping sets, system objects and the relations/types folders", async () => {
        const importRoot = await importAnytype({
            "objects/page1.pb.json": pageObject("page1", "Real Page", ["content"]),
            // A set/collection: sbType Page but layout 3.
            "objects/set1.pb.json": pageObject("set1", "My Set", [], { layout: 3 }),
            // A non-page system object.
            "objects/participant.pb.json": pageObject("participant", "Someone", [], { sbType: "Participant", layout: 19 }),
            // Sibling folders the basic importer ignores.
            "relations/rel1.pb.json": JSON.stringify({ sbType: "STRelation", snapshot: { data: { details: { id: "rel1", name: "Author" } } } }),
            "types/type1.pb.json": JSON.stringify({ sbType: "STType", snapshot: { data: { details: { id: "type1", name: "Article" } } } }),
            "profile": "not json"
        });

        expect(importRoot.getChildNotes().map((note) => note.title)).toEqual(["Real Page"]);
    });

    it("imports a single basic page whose export omits `layout` (only resolvedLayout is set)", async () => {
        // A single-object export of a basic page drops the default `layout` field entirely, with backslash
        // path separators on Windows — both must still resolve to one imported page with its text.
        const page = JSON.stringify({
            sbType: "Page",
            snapshot: {
                data: {
                    blocks: [
                        { id: "solo", childrenIds: ["header", "solo-b0"] },
                        { id: "header", childrenIds: ["title"] },
                        { id: "title", text: { text: "", style: "Title" } },
                        { id: "solo-b0", text: { text: "Regular text", style: "Paragraph" } }
                    ],
                    details: { id: "solo", name: "Formatting test", resolvedLayout: 0 }
                }
            }
        });
        const importRoot = await importAnytype({ "objects\\solo.pb.json": page });

        const children = importRoot.getChildNotes();
        expect(children.map((note) => note.title)).toEqual(["Formatting test"]);
        expect(decodeUtf8(children[0]?.getContent() ?? "")).toBe("<p>Regular text</p>");
    });

    it("produces an empty root when the export has no pages", async () => {
        const importRoot = await importAnytype({
            "types/type1.pb.json": JSON.stringify({ sbType: "STType", snapshot: { data: { details: { id: "type1", name: "Article" } } } })
        });

        expect(importRoot.title).toBe("Anytype import");
        expect(importRoot.getChildNotes()).toHaveLength(0);
    });
});
