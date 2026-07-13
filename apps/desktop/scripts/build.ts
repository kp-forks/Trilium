import { writeFileSync } from "fs";
import { join } from "path";

import BuildHelper from "../../../scripts/build-utils";
import originalPackageJson from "../package.json" with { type: "json" };

const build = new BuildHelper("apps/desktop");

async function main() {
    // The preload runs in Electron's sandboxed renderer, where the
    // import.meta.url shim's `require("node:url")` banner throws and aborts the
    // preload before it can expose `electronApi`. Build it without the shim
    // (it never references import.meta.url). Build it first so the main bundle,
    // built after, leaves the final meta.json.
    await build.buildBackend([ "src/preload.ts" ], { importMetaUrlShim: false });
    await build.buildBackend([ "src/main.ts" ]);

    // Copy assets.
    build.copy("src/assets", "assets/");
    build.copy("/apps/server/src/assets", "assets/");
    build.copy("/packages/trilium-core/src/assets/schema.sql", "assets/schema.sql");
    build.triggerBuildAndCopyTo("packages/share-theme", "share-theme/assets/");
    build.copy("/packages/share-theme/src/templates", "share-theme/templates/");

    // Copy node modules dependencies
    build.copyNodeModules([ "better-sqlite3", "bindings", "file-uri-to-path" ]);

    // The Claude Agent SDK's JavaScript is bundled into main.cjs, but at
    // query time it spawns a native `claude` binary shipped as a per-platform
    // optional dependency (@anthropic-ai/claude-agent-sdk-<platform>-<arch>).
    // That binary can't be bundled — ship the host platform's package so the
    // SDK's runtime `createRequire(import.meta.url).resolve(...)` finds it in
    // dist/node_modules. (Cross-platform release builds must ship the target's
    // package; on musl Linux the `-musl` variant is installed instead.)
    build.copyNodeModules([ `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}` ]);
    build.copy("/node_modules/ckeditor5/dist/ckeditor5-content.css", "ckeditor5-content.css");

    build.buildFrontend();

    generatePackageJson();
}

function generatePackageJson() {
    const { version, author, license, description, dependencies, devDependencies } = originalPackageJson;
    const packageJson = {
        name: "trilium",
        main: "main.cjs",
        version, author, license, description,
        dependencies: {
            "better-sqlite3": dependencies["better-sqlite3"],
        },
        devDependencies: {
            electron: devDependencies.electron
        },
        config: {
            forge: "../electron-forge/forge.config.ts"
        }
    };
    writeFileSync(join(build.outDir, "package.json"), JSON.stringify(packageJson, null, "\t"), "utf-8");
}

main();
