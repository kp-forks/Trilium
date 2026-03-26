import { beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { initializeCore } from "@triliumnext/core";
import ClsHookedExecutionContext from "../src/cls_provider.js";
import NodejsCryptoProvider from "../src/crypto_provider.js";
import ServerPlatformProvider from "../src/platform_provider.js";
import BetterSqlite3Provider from "../src/sql_provider.js";
import { initializeTranslations } from "../src/services/i18n.js";

// Initialize environment variables.
process.env.TRILIUM_DATA_DIR = join(__dirname, "db");
process.env.TRILIUM_RESOURCE_DIR = join(__dirname, "../src");
process.env.TRILIUM_INTEGRATION_TEST = "memory";
process.env.TRILIUM_ENV = "dev";
process.env.TRILIUM_PUBLIC_SERVER = "http://localhost:4200";

beforeAll(async () => {
    const dbProvider = new BetterSqlite3Provider();
    dbProvider.loadFromMemory();

    await initializeCore({
        dbConfig: {
            provider: dbProvider,
            isReadOnly: false,
            onTransactionCommit() {},
            onTransactionRollback() {}
        },
        crypto: new NodejsCryptoProvider(),
        executionContext: new ClsHookedExecutionContext(),
        schema: readFileSync(require.resolve("@triliumnext/core/src/assets/schema.sql"), "utf-8"),
        platform: new ServerPlatformProvider(),
        translations: initializeTranslations
    });
});
