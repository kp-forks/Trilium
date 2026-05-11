import type { FileStream, ZipArchive, ZipEntry, ZipProvider } from "@triliumnext/core/src/services/zip_provider.js";
import { strToU8, unzip, zipSync } from "fflate";

type ZipOutput = {
    send?: (body: unknown) => unknown;
    write?: (chunk: Uint8Array | string) => unknown;
    end?: (chunk?: Uint8Array | string) => unknown;
};

class BrowserZipArchive implements ZipArchive {
    readonly #entries: Record<string, Uint8Array> = {};
    #destination: ZipOutput | null = null;

    append(content: string | Uint8Array, options: { name: string }) {
        this.#entries[options.name] = typeof content === "string" ? strToU8(content) : content;
    }

    pipe(destination: unknown) {
        this.#destination = destination as ZipOutput;
    }

    async finalize(): Promise<void> {
        if (!this.#destination) {
            throw new Error("ZIP output destination not set.");
        }

        const content = zipSync(this.#entries, { level: 9 });

        if (typeof this.#destination.send === "function") {
            this.#destination.send(content);
            return;
        }

        if (typeof this.#destination.end === "function") {
            if (typeof this.#destination.write === "function") {
                this.#destination.write(content);
                this.#destination.end();
            } else {
                this.#destination.end(content);
            }
            return;
        }

        throw new Error("Unsupported ZIP output destination.");
    }
}

export default class BrowserZipProvider implements ZipProvider {
    async detectFilenameEncoding(_buffer: Uint8Array): Promise<string> {
        // fflate handles filename decoding internally; no additional detection needed.
        return "utf-8";
    }

    createZipArchive(): ZipArchive {
        return new BrowserZipArchive();
    }

    createFileStream(_filePath: string): FileStream {
        throw new Error("File stream creation is not supported in the browser.");
    }

    readZipFile(
        buffer: Uint8Array,
        processEntry: (entry: ZipEntry, readContent: () => Promise<Uint8Array>) => Promise<void>,
        _filenameEncoding?: string
    ): Promise<void> {
        return new Promise<void>((res, rej) => {
            unzip(buffer, async (err, files) => {
                if (err) { rej(err); return; }

                try {
                    for (const [fileName, data] of Object.entries(files)) {
                        await processEntry(
                            { fileName: decodeZipFileName(fileName) },
                            () => Promise.resolve(data)
                        );
                    }
                    res();
                } catch (e) {
                    rej(e);
                }
            });
        });
    }
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * fflate decodes ZIP entry filenames as CP437/Latin-1 unless the language
 * encoding flag (general purpose bit 11) is set, but many real-world archives
 * (e.g. those produced by macOS / Linux unzip / Python's zipfile) write UTF-8
 * filenames without setting that flag. Recover the original UTF-8 bytes from
 * fflate's per-byte string and re-decode them; if the result isn't valid
 * UTF-8 we fall back to the as-decoded name.
 */
function decodeZipFileName(name: string): string {
    const bytes = new Uint8Array(name.length);
    for (let i = 0; i < name.length; i++) {
        bytes[i] = name.charCodeAt(i) & 0xff;
    }
    try {
        return utf8Decoder.decode(bytes);
    } catch {
        return name;
    }
}
