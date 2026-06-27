import type { ZipEntry } from "@triliumnext/core/src/services/zip_provider.js";
import { PassThrough } from "stream";
import { describe, expect, it } from "vitest";

import NodejsZipProvider from "./zip_provider.js";

const provider = new NodejsZipProvider();

/** Builds an archive from the given entries and returns the finalized zip bytes. */
async function buildZip(entries: { name: string; content: string | Uint8Array }[]): Promise<Buffer> {
    const archive = provider.createZipArchive();
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
        sink.on("end", () => resolve(Buffer.concat(chunks)));
        sink.on("error", reject);
    });

    archive.pipe(sink);
    for (const entry of entries) {
        archive.append(entry.content, { name: entry.name });
    }
    await archive.finalize();
    return done;
}

/** Reads an archive into a `{ fileName -> bytes }` map via the provider's own reader. */
async function readZip(buffer: Buffer): Promise<Record<string, Buffer>> {
    const out: Record<string, Buffer> = {};
    await provider.readZipFile(buffer, async (entry: ZipEntry, readContent) => {
        out[entry.fileName] = Buffer.from(await readContent());
    });
    return out;
}

describe("NodejsZipProvider", () => {
    it("round-trips string content", async () => {
        const buffer = await buildZip([{ name: "note.html", content: "<p>hello</p>" }]);
        const entries = await readZip(buffer);
        expect(entries["note.html"].toString("utf-8")).toBe("<p>hello</p>");
    });

    it("round-trips binary content byte-for-byte", async () => {
        // Non-UTF-8 bytes so any string coercion would corrupt the payload.
        const binary = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x80, 0x01, 0xfe]);
        const buffer = await buildZip([{ name: "pixel.png", content: binary }]);
        const entries = await readZip(buffer);
        expect(Buffer.compare(entries["pixel.png"], Buffer.from(binary))).toBe(0);
    });

    it("appends only the bytes of a sliced Uint8Array view, not its backing buffer", async () => {
        // A view with a non-zero byteOffset over a larger backing buffer. The
        // appended entry must contain exactly the view's slice, never the
        // surrounding bytes of the pool/backing ArrayBuffer.
        const backing = new Uint8Array([0xaa, 0xbb, 0x01, 0x02, 0x03, 0xcc, 0xdd]);
        const view = backing.subarray(2, 5); // [0x01, 0x02, 0x03]
        expect(view.byteOffset).toBe(2);

        const buffer = await buildZip([{ name: "slice.bin", content: view }]);
        const entries = await readZip(buffer);
        expect(Buffer.compare(entries["slice.bin"], Buffer.from([0x01, 0x02, 0x03]))).toBe(0);
    });

    it("reads multiple entries with their decoded file names", async () => {
        const buffer = await buildZip([
            { name: "a.txt", content: "alpha" },
            { name: "dir/b.txt", content: "beta" }
        ]);
        const entries = await readZip(buffer);
        expect(Object.keys(entries).sort()).toEqual(["a.txt", "dir/b.txt"]);
        expect(entries["dir/b.txt"].toString("utf-8")).toBe("beta");
    });
});
