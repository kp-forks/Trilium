import { type OptionRow } from "@triliumnext/commons";
import { sql_init as coreSqlInit } from "@triliumnext/core";
import fs from "fs";

import BOption from "../becca/entities/boption.js";
import log from "./log.js";
import resourceDir from "./resource_dir.js";
import sql from "./sql.js";

const schemaExists = coreSqlInit.schemaExists;
const isDbInitialized = coreSqlInit.isDbInitialized;
const dbReady = coreSqlInit.dbReady;
const setDbAsInitialized = coreSqlInit.setDbAsInitialized;
const createInitialDatabase = coreSqlInit.createInitialDatabase;
const initializeDb = coreSqlInit.initializeDb;
export const getDbSize = coreSqlInit.getDbSize;
const createDatabaseForSync = coreSqlInit.createDatabaseForSync;

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
