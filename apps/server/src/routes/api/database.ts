import { BackupDatabaseNowResponse, DatabaseCheckIntegrityResponse } from "@triliumnext/commons";
import { becca_loader, ValidationError } from "@triliumnext/core";
import type { Request } from "express";
import { readFileSync } from "fs";

import anonymizationService from "../../services/anonymization.js";
import backupService from "../../services/backup.js";
import consistencyChecksService from "../../services/consistency_checks.js";
import log from "../../services/log.js";
import sql from "../../services/sql.js";
import sql_init from "../../services/sql_init.js";

function getExistingBackups() {
    return backupService.getExistingBackups();
}

async function backupDatabase() {
    return {
        backupFile: await backupService.backupNow("now")
    } satisfies BackupDatabaseNowResponse;
}

function vacuumDatabase() {
    sql.execute("VACUUM");

    log.info("Database has been vacuumed.");
}

function findAndFixConsistencyIssues() {
    consistencyChecksService.runOnDemandChecks(true);
}

async function rebuildIntegrationTestDatabase() {
    // Reload the integration test database fixture into the in-memory SQL
    // backend, then re-init schema-dependent state and the becca cache.
    // Test-mode only — registered in routes.ts under the same env-var guard.
    const fixtureBytes = readFileSync(require.resolve("@triliumnext/core/src/test/fixtures/document.db"));
    sql.rebuildFromBuffer(fixtureBytes);
    sql_init.initializeDb();
    becca_loader.load();
}

function getExistingAnonymizedDatabases() {
    return anonymizationService.getExistingAnonymizedDatabases();
}

async function anonymize(req: Request) {
    if (req.params.type !== "full" && req.params.type !== "light") {
        throw new ValidationError("Invalid type provided.");
    }
    return await anonymizationService.createAnonymizedCopy(req.params.type);
}

function checkIntegrity() {
    const results = sql.getRows<{ integrity_check: string }>("PRAGMA integrity_check");

    log.info(`Integrity check result: ${JSON.stringify(results)}`);

    return {
        results
    } satisfies DatabaseCheckIntegrityResponse;
}

export default {
    getExistingBackups,
    backupDatabase,
    vacuumDatabase,
    findAndFixConsistencyIssues,
    rebuildIntegrationTestDatabase,
    getExistingAnonymizedDatabases,
    anonymize,
    checkIntegrity
};
