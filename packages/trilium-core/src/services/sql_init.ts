import { deferred } from "@triliumnext/commons";
import { getSql } from "./sql";
import { getLog } from "./log";
import { isElectron } from "./utils";
import { t } from "i18next";
import optionService from "./options";
import eventService from "./events";
import { getContext } from "./context";
import config from "./config";

export const dbReady = deferred<void>();

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
        const log = getLog();
        if (isElectron) {
            log.info(t("sql_init.db_not_initialized_desktop"));
        } else {
            // TODO: Bring back port.
            log.info(t("sql_init.db_not_initialized_server", { port: 1234 }));
        }

        return;
    }

    //TODO: Renable migration
    //await migrationService.migrateIfNecessary();

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

async function createDatabaseForSync(a: any, b: string, c: any) {
    console.error("createDatabaseForSync is not implemented yet");
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

export default { isDbInitialized, createDatabaseForSync, setDbAsInitialized, schemaExists, getDbSize, initDbConnection, dbReady, initializeDb };
