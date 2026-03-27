import debounce from "@triliumnext/client/src/services/debounce.js";
import cls from "@triliumnext/server/src/services/cls.js";
import fs from "fs/promises";
import { join } from "path";

import { extractZip, importData, startElectron } from "./utils.js";

// Paths are relative to apps/edit-docs/dist.
const DEMO_ZIP_PATH = join(__dirname, "../../server/src/assets/db/demo.zip");
const DEMO_ZIP_DIR_PATH = join(__dirname, "../demo");

async function main() {
    const initializedPromise = startElectron(() => {
        // Wait for the import to be finished and the application to be loaded before we listen to changes.
        setTimeout(() => registerHandlers(), 10_000);
    });

    // TODO: Initialize core.
    cls.init(async () => {
        await importData(DEMO_ZIP_DIR_PATH);
        setOptions();
        initializedPromise.resolve();
    });

    initializedPromise.resolve();
}

async function setOptions() {
    const optionsService = (await import("@triliumnext/server/src/services/options.js")).default;
    optionsService.setOption("eraseUnusedAttachmentsAfterSeconds", 10);
    optionsService.setOption("eraseUnusedAttachmentsAfterTimeScale", 60);
    optionsService.setOption("compressImages", "false");
}

async function registerHandlers() {
    const { events } = await import("@triliumnext/core");
    const { erase: eraseService } = await import("@triliumnext/core");
    const debouncer = debounce(async () => {
        console.log("Exporting data");
        eraseService.eraseUnusedAttachmentsNow();
        await exportData();

        await fs.rmdir(DEMO_ZIP_DIR_PATH, { recursive: true }).catch(() => {});
        await extractZip(DEMO_ZIP_PATH, DEMO_ZIP_DIR_PATH);
    }, 10_000);
    events.subscribe(events.ENTITY_CHANGED, async (e) => {
        if (e.entityName === "options") {
            return;
        }

        console.log("Got entity changed ", e);
        debouncer();
    });
}

async function exportData() {
    const { exportToZipFile } = (await import("@triliumnext/server/src/services/export/zip.js")).default;
    await exportToZipFile("root", "html", DEMO_ZIP_PATH);
}

main();
