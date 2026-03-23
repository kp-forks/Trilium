import { type OptionRow } from "@triliumnext/commons";
import { sql_init as coreSqlInit } from "@triliumnext/core";
import fs from "fs";

import BBranch from "../becca/entities/bbranch.js";
import BNote from "../becca/entities/bnote.js";
import BOption from "../becca/entities/boption.js";
import cls from "./cls.js";
import password from "./encryption/password.js";
import hidden_subtree from "./hidden_subtree.js";
import zipImportService from "./import/zip.js";
import log from "./log.js";
import optionService from "./options.js";
import resourceDir from "./resource_dir.js";
import sql from "./sql.js";
import TaskContext from "./task_context.js";

const schemaExists = coreSqlInit.schemaExists;
const isDbInitialized = coreSqlInit.isDbInitialized;
const dbReady = coreSqlInit.dbReady;
const setDbAsInitialized = coreSqlInit.setDbAsInitialized;
const initDbConnection = coreSqlInit.initDbConnection;
const initializeDb = coreSqlInit.initializeDb;
export const getDbSize = coreSqlInit.getDbSize;

/**
 * Applies the database schema, creating the necessary tables and importing the demo content.
 *
 * @param skipDemoDb if set to `true`, then the demo database will not be imported, resulting in an empty root note.
 * @throws {Error} if the database is already initialized.
 */
async function createInitialDatabase(skipDemoDb?: boolean) {
    if (isDbInitialized()) {
        throw new Error("DB is already initialized");
    }

    const schema = fs.readFileSync(`${resourceDir.DB_INIT_DIR}/schema.sql`, "utf-8");
    const demoFile = (!skipDemoDb ? fs.readFileSync(`${resourceDir.DB_INIT_DIR}/demo.zip`) : null);

    let rootNote!: BNote;

    // We have to import async since options init requires keyboard actions which require translations.
    const optionsInitService = (await import("./options_init.js")).default;
    const becca_loader = (await import("@triliumnext/core")).becca_loader;

    sql.transactional(() => {
        log.info("Creating database schema ...");

        sql.executeScript(schema);

        becca_loader.load();

        log.info("Creating root note ...");

        rootNote = new BNote({
            noteId: "root",
            title: "root",
            type: "text",
            mime: "text/html"
        }).save();

        rootNote.setContent("");

        new BBranch({
            noteId: "root",
            parentNoteId: "none",
            isExpanded: true,
            notePosition: 10
        }).save();

        optionsInitService.initDocumentOptions();
        optionsInitService.initNotSyncedOptions(true, {});
        optionsInitService.initStartupOptions();
        password.resetPassword();
    });

    // Check hidden subtree.
    // This ensures the existence of system templates, for the demo content.
    console.log("Checking hidden subtree at first start.");
    cls.init(() => hidden_subtree.checkHiddenSubtree());

    // Import demo content.
    log.info("Importing demo content...");

    const dummyTaskContext = new TaskContext("no-progress-reporting", "importNotes", null);

    if (demoFile) {
        await zipImportService.importZip(dummyTaskContext, demoFile, rootNote);
    }

    // Post-demo.
    sql.transactional(() => {
        // this needs to happen after ZIP import,
        // the previous solution was to move option initialization here, but then the important parts of initialization
        // are not all in one transaction (because ZIP import is async and thus not transactional)

        const startNoteId = sql.getValue("SELECT noteId FROM branches WHERE parentNoteId = 'root' AND isDeleted = 0 ORDER BY notePosition");

        optionService.setOption(
            "openNoteContexts",
            JSON.stringify([
                {
                    notePath: startNoteId,
                    active: true
                }
            ])
        );
    });

    log.info("Schema and initial content generated.");

    initDbConnection();
}

async function createDatabaseForSync(options: OptionRow[], syncServerHost = "", syncProxy = "") {
    log.info("Creating database for sync");

    if (isDbInitialized()) {
        throw new Error("DB is already initialized");
    }

    const schema = fs.readFileSync(`${resourceDir.DB_INIT_DIR}/schema.sql`, "utf8");

    // We have to import async since options init requires keyboard actions which require translations.
    const optionsInitService = (await import("./options_init.js")).default;

    sql.transactional(() => {
        sql.executeScript(schema);

        optionsInitService.initNotSyncedOptions(false, { syncServerHost, syncProxy });

        // document options required for sync to kick off
        for (const opt of options) {
            new BOption(opt).save();
        }
    });

    log.info("Schema and not synced options generated.");
}

export default {
    dbReady,
    schemaExists,
    isDbInitialized,
    createInitialDatabase,
    createDatabaseForSync,
    setDbAsInitialized,
    getDbSize,
    initializeDb
};
