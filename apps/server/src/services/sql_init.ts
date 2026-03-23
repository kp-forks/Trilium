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
