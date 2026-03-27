import type { ZipEntry, ZipProvider } from "@triliumnext/core/src/services/import/zip_provider.js";
import { unzip } from "fflate";

export default class BrowserZipProvider implements ZipProvider {
    readZipFile(
        buffer: Uint8Array,
        processEntry: (entry: ZipEntry, readContent: () => Promise<Uint8Array>) => Promise<void>
    ): Promise<void> {
        return new Promise<void>((res, rej) => {
            unzip(buffer, async (err, files) => {
                if (err) { rej(err); return; }

                try {
                    for (const [fileName, data] of Object.entries(files)) {
                        await processEntry(
                            { fileName },
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
