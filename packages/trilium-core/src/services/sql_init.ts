import { deferred, OptionRow } from "@triliumnext/commons";
import { getSql } from "./sql";
import { getLog } from "./log";
import optionService from "./options";
import eventService from "./events";
import { getContext } from "./context";
import config from "./config";
import BNote from "../becca/entities/bnote";
import BBranch from "../becca/entities/bbranch";
import hidden_subtree from "./hidden_subtree";
import TaskContext from "./task_context";
import BOption from "../becca/entities/boption";
import migrationService from "./migration";

export const dbReady = deferred<void>();

let schema: string;

export function initSchema(schemaStr: string) {
    schema = schemaStr;
}

function schemaExists() {
    return !!getSql().getValue(/*sql*/`SELECT name FROM sqlite_master
        WHERE type = 'table' AND name = 'options'`);
}

function isDbInitialized() {
    try {
        if (!schemaExists()) {
            return false;
        }

        const initialized = getSql().getValue("SELECT value FROM options WHERE name = 'initialized'");
        return initialized === "true";
    } catch (e) {
        return false;
    }
}

async function initDbConnection() {
    if (!isDbInitialized()) {
        return;
    }

    await migrationService.migrateIfNecessary();

    const sql = getSql();
    sql.execute('CREATE TEMP TABLE IF NOT EXISTS "param_list" (`paramId` TEXT NOT NULL PRIMARY KEY)');

    sql.execute(`
    CREATE TABLE IF NOT EXISTS "user_data"
    (
        tmpID INT,
        username TEXT,
        email TEXT,
        userIDEncryptedDataKey TEXT,
        userIDVerificationHash TEXT,
        salt TEXT,
        derivedKey TEXT,
        isSetup TEXT DEFAULT "false",
        UNIQUE (tmpID),
        PRIMARY KEY (tmpID)
    );`);

    dbReady.resolve();
}

function setDbAsInitialized() {
    if (!isDbInitialized()) {
        optionService.setOption("initialized", "true");

        initDbConnection();

        // Emit an event to notify that the database is now initialized
        eventService.emit(eventService.DB_INITIALIZED);

        getLog().info("Database initialization completed, emitted DB_INITIALIZED event");
    }
}

function getDbSize() {
    return getSql().getValue<number>("SELECT page_count * page_size / 1000 as size FROM pragma_page_count(), pragma_page_size()");
}

function optimize() {
    if (config.General.readOnly) {
        return;
    }
    const log = getLog();
    log.info("Optimizing database");
    const start = Date.now();

    getSql().execute("PRAGMA optimize");

    log.info(`Optimization finished in ${Date.now() - start}ms.`);
}

function initializeDb() {
    getContext().init(initDbConnection);

    dbReady.then(() => {
        // TODO: Re-enable backup.
        // if (config.General && config.General.noBackup === true) {
        //     log.info("Disabling scheduled backups.");

        //     return;
        // }

        // setInterval(() => backup.regularBackup(), 4 * 60 * 60 * 1000);

        // // kickoff first backup soon after start up
        // setTimeout(() => backup.regularBackup(), 5 * 60 * 1000);

        // // optimize is usually inexpensive no-op, so running it semi-frequently is not a big deal
        // setTimeout(() => optimize(), 60 * 60 * 1000);

        // setInterval(() => optimize(), 10 * 60 * 60 * 1000);
    });
}

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

    let rootNote!: BNote;

    // We have to import async since options init requires keyboard actions which require translations.
    const { initDocumentOptions, initNotSyncedOptions, initStartupOptions } = await import("./options_init.js");
    const { load: loadBecca } = await import("../becca/becca_loader.js");

    const sql = getSql();
    const log = getLog();
    sql.transactional(() => {
        log.info("Creating database schema ...");
        sql.executeScript(schema);

        loadBecca();

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

        // Bring in option init.
        initDocumentOptions();
        initNotSyncedOptions(true, {});
        initStartupOptions();
        // password.resetPassword();
    });

    // Check hidden subtree.
    // This ensures the existence of system templates, for the demo content.
    console.log("Checking hidden subtree at first start.");
    getContext().init(() => {
        getSql().transactional(() => hidden_subtree.checkHiddenSubtree());
    });

    // Import demo content.
    log.info("Importing demo content...");

    const dummyTaskContext = new TaskContext("no-progress-reporting", "importNotes", null);

    // if (demoFile) {
    //     await zipImportService.importZip(dummyTaskContext, demoFile, rootNote);
    // }

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
    const log = getLog();
    const sql = getSql();
    log.info("Creating database for sync");

    if (isDbInitialized()) {
        throw new Error("DB is already initialized");
    }

    // We have to import async since options init requires keyboard actions which require translations.
    const { initNotSyncedOptions } = await import("./options_init.js");

    sql.transactional(() => {
        sql.executeScript(schema);

        initNotSyncedOptions(false, { syncServerHost, syncProxy });

        // document options required for sync to kick off
        for (const opt of options) {
            new BOption(opt).save();
        }
    });

    log.info("Schema and not synced options generated.");
}

export default { isDbInitialized, createDatabaseForSync, setDbAsInitialized, schemaExists, getDbSize, initDbConnection, dbReady, initializeDb, createInitialDatabase };
