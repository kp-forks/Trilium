export interface ZipEntry {
    fileName: string;
}

export interface ZipProvider {
    /**
     * Iterates over every entry in a ZIP buffer, calling `processEntry` for each one.
     * `readContent()` inside the callback reads the raw bytes of that entry on demand.
     */
    readZipFile(
        buffer: Uint8Array,
        processEntry: (entry: ZipEntry, readContent: () => Promise<Uint8Array>) => Promise<void>
    ): Promise<void>;
}

let zipProvider: ZipProvider | null = null;

export function initZipProvider(provider: ZipProvider) {
    zipProvider = provider;
}

export function getZipProvider(): ZipProvider {
    if (!zipProvider) throw new Error("ZipProvider not initialized.");
    return zipProvider;
}
