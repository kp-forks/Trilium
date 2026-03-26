/*
 * Make sure not to import any modules that depend on localized messages via i18next here, as the initializations
 * are loaded later and will result in an empty string.
 */

import { getLog,initializeCore, sql_init } from "@triliumnext/core";
import fs from "fs";
import { t } from "i18next";
import path from "path";

import ClsHookedExecutionContext from "./cls_provider.js";
import NodejsCryptoProvider from "./crypto_provider.js";
import ServerPlatformProvider from "./platform_provider.js";
import dataDirs from "./services/data_dir.js";
import port from "./services/port.js";
import NodeRequestProvider from "./services/request.js";
import WebSocketMessagingProvider from "./services/ws_messaging_provider.js";
import BetterSqlite3Provider from "./sql_provider.js";

async function startApplication() {
    const config = (await import("./services/config.js")).default;
    const { DOCUMENT_PATH } = (await import("./services/data_dir.js")).default;

    const dbProvider = new BetterSqlite3Provider();
    dbProvider.loadFromFile(DOCUMENT_PATH, config.General.readOnly);

    await initializeCore({
        dbConfig: {
            provider: dbProvider,
            isReadOnly: config.General.readOnly,
            async onTransactionCommit() {
                const ws = (await import("./services/ws.js")).default;
                ws.sendTransactionEntityChangesToAllClients();
            },
            async onTransactionRollback() {
                const cls = (await import("./services/cls.js")).default;
                const becca_loader = (await import("@triliumnext/core")).becca_loader;
                const entity_changes = (await import("./services/entity_changes.js")).default;
                const log = (await import("./services/log")).default;

                const entityChangeIds = cls.getAndClearEntityChangeIds();

                if (entityChangeIds.length > 0) {
                    log.info("Transaction rollback dirtied the becca, forcing reload.");

                    becca_loader.load();
                }

                // the maxEntityChangeId has been incremented during failed transaction, need to recalculate
                entity_changes.recalculateMaxEntityChangeId();
            }
        },
        crypto: new NodejsCryptoProvider(),
        request: new NodeRequestProvider(),
        executionContext: new ClsHookedExecutionContext(),
        messaging: new WebSocketMessagingProvider(),
        schema: fs.readFileSync(require.resolve("@triliumnext/core/src/assets/schema.sql"), "utf-8"),
        platform: new ServerPlatformProvider(),
        translations: (await import("./services/i18n.js")).initializeTranslations,
        extraAppInfo: {
            nodeVersion: process.version,
            dataDirectory: path.resolve(dataDirs.TRILIUM_DATA_DIR)
        }
    });
    const startTriliumServer = (await import("./www.js")).default;
    await startTriliumServer();

    if (!sql_init.isDbInitialized()) {
        getLog().banner(t("sql_init.db_not_initialized_server", { port }));
    }
}

startApplication();
