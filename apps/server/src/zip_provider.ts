import type { ZipEntry, ZipProvider } from "@triliumnext/core/src/services/import/zip_provider.js";
import type { Stream } from "stream";
import yauzl from "yauzl";

function streamToBuffer(stream: Stream): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    stream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    return new Promise((res, rej) => {
        stream.on("end", () => res(Buffer.concat(chunks)));
        stream.on("error", rej);
    });
}

export default class NodejsZipProvider implements ZipProvider {
    readZipFile(
        buffer: Uint8Array,
        processEntry: (entry: ZipEntry, readContent: () => Promise<Uint8Array>) => Promise<void>
    ): Promise<void> {
        return new Promise<void>((res, rej) => {
            yauzl.fromBuffer(Buffer.from(buffer), { lazyEntries: true, validateEntrySizes: false }, (err, zipfile) => {
                if (err) { rej(err); return; }
                if (!zipfile) { rej(new Error("Unable to read zip file.")); return; }

                zipfile.readEntry();
                zipfile.on("entry", async (entry: yauzl.Entry) => {
                    try {
                        const readContent = () => new Promise<Uint8Array>((res, rej) => {
                            zipfile.openReadStream(entry, (err, readStream) => {
                                if (err) { rej(err); return; }
                                if (!readStream) { rej(new Error("Unable to read content.")); return; }
                                streamToBuffer(readStream).then(res, rej);
                            });
                        });

                        await processEntry({ fileName: entry.fileName }, readContent);
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
