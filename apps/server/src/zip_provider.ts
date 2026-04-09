import type { FileStream, ZipArchive, ZipEntry, ZipProvider } from "@triliumnext/core/src/services/zip_provider.js";
import archiver, { type Archiver } from "archiver";
import fs from "fs";
import type { Stream } from "stream";
import * as yauzl from "yauzl";

class NodejsZipArchive implements ZipArchive {
    readonly #archive: Archiver;

    constructor() {
        this.#archive = archiver("zip", {
            zlib: { level: 9 }
        });
    }

    append(content: string | Uint8Array, options: { name: string; date?: Date }) {
        this.#archive.append(typeof content === "string" ? content : Buffer.from(content), options);
    }

    pipe(destination: unknown) {
        this.#archive.pipe(destination as NodeJS.WritableStream);
    }

    finalize(): Promise<void> {
        return this.#archive.finalize();
    }
}

function streamToBuffer(stream: Stream): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    stream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    return new Promise((res, rej) => {
        stream.on("end", () => res(Buffer.concat(chunks)));
        stream.on("error", rej);
    });
}

export default class NodejsZipProvider implements ZipProvider {
    createZipArchive(): ZipArchive {
        return new NodejsZipArchive();
    }

    createFileStream(filePath: string): FileStream {
        const stream = fs.createWriteStream(filePath);
        return {
            destination: stream,
            waitForFinish: () => new Promise((resolve, reject) => {
                stream.on("finish", resolve);
                stream.on("error", reject);
            })
        };
    }

    readZipFile(
        buffer: Uint8Array,
        processEntry: (entry: ZipEntry, readContent: () => Promise<Uint8Array>) => Promise<void>
    ): Promise<void> {
        return new Promise<void>((res, rej) => {
            yauzl.fromBuffer(Buffer.from(buffer), { lazyEntries: true, validateEntrySizes: false, decodeStrings: false }, (err, zipfile) => {
                if (err) { rej(err); return; }
                if (!zipfile) { rej(new Error("Unable to read zip file.")); return; }

                zipfile.readEntry();
                zipfile.on("entry", async (entry: yauzl.Entry) => {
                    try {
                        // yauzl with decodeStrings: false returns fileName as a Buffer.
                        // We decode as UTF-8 to handle ZIP files that use UTF-8 filenames
                        // without setting the general purpose bit flag 11 (language encoding flag).
                        const fileName = Buffer.isBuffer(entry.fileName)
                            ? (entry.fileName as Buffer).toString("utf-8")
                            : entry.fileName;

                        const readContent = () => new Promise<Uint8Array>((res, rej) => {
                            zipfile.openReadStream(entry, (err, readStream) => {
                                if (err) { rej(err); return; }
                                if (!readStream) { rej(new Error("Unable to read content.")); return; }
                                streamToBuffer(readStream).then(res, rej);
                            });
                        });

                        await processEntry({ fileName }, readContent);
                    } catch (e) {
                        rej(e);
                    }
                    zipfile.readEntry();
                });
                zipfile.on("end", res);
                zipfile.on("error", rej);
            });
        });
    }
}
