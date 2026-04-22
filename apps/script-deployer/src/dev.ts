/**
 * Starts a dedicated Trilium instance for script development.
 *
 * On first run it initializes a fresh database (no demo content),
 * creates an ETAPI token and persists it to data/.etapi-token.
 * On subsequent runs it just boots the server.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

// ── Environment — must be set before any server module is imported ──────────
const DATA_DIR = resolve(__dirname, "../data");
const TOKEN_PATH = join(DATA_DIR, ".etapi-token");
const PORT = 37842;

mkdirSync(DATA_DIR, { recursive: true });

process.env.TRILIUM_DATA_DIR = DATA_DIR;
process.env.TRILIUM_PORT = String(PORT);
process.env.TRILIUM_RESOURCE_DIR = resolve(__dirname, "../../server/src");
process.env.NODE_ENV = "development";
process.env.TRILIUM_ENV = "dev";

// ── Bootstrap ───────────────────────────────────────────────────────────────
const needsInit = !existsSync(join(DATA_DIR, "document.db"));

async function ensureDatabase() {
    if (!needsInit) return;

    console.log("No database found — creating a fresh instance…");

    const i18n = await import("@triliumnext/server/src/services/i18n.js");
    await i18n.initializeTranslations();

    const cls = (await import("@triliumnext/server/src/services/cls.js")).default;
    const sqlInit = (await import("@triliumnext/server/src/services/sql_init.js")).default;

    // createInitialDatabase must run inside CLS (it touches becca).
    await cls.init(async () => {
        await sqlInit.createInitialDatabase(/* skipDemoDb */ true);
    });

    console.log("Database created.");
}

async function ensureEtapiToken() {
    if (existsSync(TOKEN_PATH)) {
        const token = readFileSync(TOKEN_PATH, "utf-8").trim();
        console.log(`ETAPI token: ${token}`);
        return;
    }

    const cls = (await import("@triliumnext/server/src/services/cls.js")).default;
    const etapiTokens = (await import("@triliumnext/server/src/services/etapi_tokens.js")).default;

    const authToken: string = cls.init(() => {
        const { authToken } = etapiTokens.createToken("script-deployer");
        return authToken;
    });

    writeFileSync(TOKEN_PATH, authToken + "\n");
    console.log(`ETAPI token created and saved to ${TOKEN_PATH}`);
    console.log(`ETAPI token: ${authToken}`);
}

async function main() {
    await ensureDatabase();
    await ensureEtapiToken();

    // Now start the full HTTP server (it will re-init the DB connection
    // harmlessly since it's already initialised).
    const startTriliumServer = (await import("@triliumnext/server/src/www.js")).default;
    await startTriliumServer();

    console.log(`\nScript-deployer Trilium instance running on http://localhost:${PORT}`);
    console.log(`Token file: ${TOKEN_PATH}\n`);
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
