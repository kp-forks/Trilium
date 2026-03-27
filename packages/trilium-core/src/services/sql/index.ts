import sql_init from "../sql_init";
import type { SqlService } from "./sql";

let sql: SqlService | null = null;

export function initSql(instance: SqlService) {
    if (sql) throw new Error("SQL already initialized");
    sql = instance;
    sql_init.initializeDb();
}

export function getSql(): SqlService {
    if (!sql) throw new Error("SQL not initialized");
    return sql;
}

export function rebuildIntegrationTestDatabase(path?: string) {
    throw new Error("Not implemented");
}
