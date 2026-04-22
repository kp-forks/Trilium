/**
 * Starts a dedicated Trilium instance for script development.
 *
 * On first run it initializes a fresh database (no demo content),
 * creates an ETAPI token and persists it to data/.etapi-token.
 * On subsequent runs it just boots the server.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, watch, writeFileSync } from "node:fs";
import { resolve, join, basename, extname } from "node:path";
import { transformSync } from "esbuild";

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

// ── Constants ───────────────────────────────────────────────────────────────
const SCRIPTS_DIR = resolve(__dirname, "../scripts");
const SCRIPTS_NOTE_ID = "_scripts";
const needsInit = !existsSync(join(DATA_DIR, "document.db"));

const MIME_BY_EXT: Record<string, string> = {
    ".jsx": "text/jsx",
    ".tsx": "text/jsx",
    ".js": "application/javascript;env=frontend",
    ".ts": "application/javascript;env=backend",
    ".html": "text/html",
    ".css": "text/css",
};

/** Extensions that need esbuild transpilation before deployment. */
const TRANSPILE_EXTS = new Set([".tsx", ".ts"]);

/**
 * Transpiles TypeScript/TSX source to JavaScript via esbuild.
 * Preserves bare `trilium:*` imports (esbuild's `transform` doesn't resolve them).
 */
function transpile(source: string, filePath: string): string {
    const ext = extname(filePath);
    if (!TRANSPILE_EXTS.has(ext)) return source;

    const result = transformSync(source, {
        loader: ext === ".tsx" ? "tsx" : "ts",
        jsx: "transform",
        jsxFactory: "h",
        jsxFragment: "Fragment",
        sourcemap: false,
    });
    return result.code;
}

// ── Front matter parsing ────────────────────────────────────────────────────

interface ScriptMeta {
    id: string;
    type: string;
    title: string;
    [key: string]: string;
}

/**
 * Parses the @trilium-script YAML front matter from a JSDoc comment block.
 *
 *   /**
 *    * @trilium-script
 *    *
 *    * id: my-script
 *    * type: render
 *    * title: My Script
 *    *\/
 */
function parseScriptMeta(source: string, filePath: string): ScriptMeta | null {
    const match = source.match(/\/\*\*[\s\S]*?@trilium-script\s*([\s\S]*?)\*\//);
    if (!match) return null;

    const block = match[1];
    const meta: Record<string, string> = {};

    for (const line of block.split("\n")) {
        // Strip leading ` * ` prefix and trim.
        const cleaned = line.replace(/^\s*\*\s?/, "").trim();
        if (!cleaned) continue;

        const colon = cleaned.indexOf(":");
        if (colon === -1) continue;

        const key = cleaned.slice(0, colon).trim();
        const value = cleaned.slice(colon + 1).trim();
        if (key && value) meta[key] = value;
    }

    const missing = ["id", "type", "title"].filter((k) => !meta[k]);
    if (missing.length) {
        console.error(`  SKIP ${filePath}: missing required fields: ${missing.join(", ")}`);
        return null;
    }

    return meta as ScriptMeta;
}

async function ensureTranslations() {
    const i18n = await import("@triliumnext/server/src/services/i18n.js");
    await i18n.initializeTranslations();
}

async function ensureDatabase() {
    if (!needsInit) return;

    console.log("No database found — creating a fresh instance…");

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

async function ensureScriptsFolder() {
    const becca = (await import("@triliumnext/server/src/becca/becca.js")).default;
    if (becca.notes[SCRIPTS_NOTE_ID]) return;

    const cls = (await import("@triliumnext/server/src/services/cls.js")).default;
    const notesService = (await import("@triliumnext/server/src/services/notes.js")).default;

    cls.init(() => {
        notesService.createNewNote({
            noteId: SCRIPTS_NOTE_ID,
            parentNoteId: "root",
            title: "Scripts",
            type: "doc",
            content: "",
        });
    });

    console.log("Created 'Scripts' folder note.");
}

async function deployScripts() {
    const files = readdirSync(SCRIPTS_DIR).filter((f) => MIME_BY_EXT[extname(f)]);
    if (!files.length) {
        console.log("No scripts to deploy.");
        return;
    }

    const becca = (await import("@triliumnext/server/src/becca/becca.js")).default;
    const cls = (await import("@triliumnext/server/src/services/cls.js")).default;
    const notesService = (await import("@triliumnext/server/src/services/notes.js")).default;

    console.log(`Deploying ${files.length} script(s)…`);

    for (const file of files) {
        const filePath = join(SCRIPTS_DIR, file);
        const source = readFileSync(filePath, "utf-8");
        const meta = parseScriptMeta(source, file);
        if (!meta) continue;

        const mime = MIME_BY_EXT[extname(file)]!;
        const codeNoteId = `_sd_${meta.id}`;
        const content = transpile(source, file);

        cls.init(() => {
            const existing = becca.notes[codeNoteId];
            if (existing) {
                // Update content and title of existing note.
                existing.title = meta.title;
                existing.save();
                existing.setContent(content);
                console.log(`  Updated: ${meta.title} (${codeNoteId})`);
            } else if (meta.type === "render") {
                // Create a render note under Scripts, with the code note
                // as its child linked via ~renderNote.
                const renderNoteId = `_sd_${meta.id}_render`;
                notesService.createNewNote({
                    noteId: renderNoteId,
                    parentNoteId: SCRIPTS_NOTE_ID,
                    title: meta.title,
                    type: "render",
                    content: "",
                });

                notesService.createNewNote({
                    noteId: codeNoteId,
                    parentNoteId: renderNoteId,
                    title: meta.title,
                    type: "code",
                    mime,
                    content,
                });

                const renderNote = becca.notes[renderNoteId];
                renderNote.setRelation("renderNote", codeNoteId);

                console.log(`  Created: ${meta.title} (${meta.type})`);
            } else {
                // Plain code note (widget, backend script, etc.)
                notesService.createNewNote({
                    noteId: codeNoteId,
                    parentNoteId: SCRIPTS_NOTE_ID,
                    title: meta.title,
                    type: "code",
                    mime,
                    content,
                });

                console.log(`  Created: ${meta.title} (${meta.type})`);
            }
        });
    }
}

function watchScripts() {
    // Debounce per file — editors can fire multiple events on a single save.
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    watch(SCRIPTS_DIR, (eventType, filename) => {
        if (!filename || !MIME_BY_EXT[extname(filename)]) return;

        if (timers.has(filename)) clearTimeout(timers.get(filename));
        timers.set(filename, setTimeout(() => {
            timers.delete(filename);
            syncFile(filename);
        }, 100));
    });

    async function syncFile(filename: string) {
        const filePath = join(SCRIPTS_DIR, filename);
        if (!existsSync(filePath)) return;

        const source = readFileSync(filePath, "utf-8");
        const meta = parseScriptMeta(source, filename);
        if (!meta) return;

        const codeNoteId = `_sd_${meta.id}`;

        // Already in memory from deployScripts(), import() returns from cache.
        const becca = (await import("@triliumnext/server/src/becca/becca.js")).default;
        const cls = (await import("@triliumnext/server/src/services/cls.js")).default;

        const note = becca.notes[codeNoteId];
        if (!note) {
            console.log(`  [watch] ${filename}: note ${codeNoteId} not found, restart to create.`);
            return;
        }

        const content = transpile(source, filename);

        cls.init(() => {
            note.setContent(content);
        });

        // For render scripts, trigger a refresh of the active render note
        // by injecting a small client-side script via websocket.
        if (meta.type === "render") {
            const ws = (await import("@triliumnext/server/src/services/ws.js")).default;
            const renderNoteId = `_sd_${meta.id}_render`;
            ws.sendMessageToAllClients({
                type: "execute-script",
                script: `function() {
                    for (const ctx of api.getNoteContexts()) {
                        if (ctx.noteId === "${renderNoteId}") {
                            api.triggerEvent("refreshData", { ntxId: ctx.ntxId });
                            console.log("[script-deployer] refreshed", "${meta.title}", "in context", ctx.ntxId);
                        }
                    }
                }`,
                params: [],
                currentNoteId: codeNoteId,
                originEntityName: "notes",
                originEntityId: codeNoteId,
            });
        }

        console.log(`  [watch] Synced: ${meta.title}`);
    }

    console.log(`Watching ${SCRIPTS_DIR} for changes…`);
}

async function main() {
    await ensureTranslations();
    await ensureDatabase();
    await ensureEtapiToken();

    // Start the full HTTP server — this loads becca and makes the note
    // tree available for subsequent setup steps.
    const startTriliumServer = (await import("@triliumnext/server/src/www.js")).default;
    await startTriliumServer();

    await ensureScriptsFolder();
    await deployScripts();
    watchScripts();

    console.log(`\nScript-deployer Trilium instance running on http://localhost:${PORT}`);
    console.log(`Token file: ${TOKEN_PATH}\n`);
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
