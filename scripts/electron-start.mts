import { execSync } from "child_process";
import { buildSync } from "esbuild";
import { getElectronPath, isNixOS } from "./utils.mjs";

// Compile the preload script to CJS so Electron's sandboxed renderer can load it.
buildSync({
    entryPoints: ["src/preload.ts"],
    outfile: "src/preload.compiled.cjs",
    platform: "node",
    format: "cjs",
    bundle: true,
    external: ["electron"]
});

const LD_LIBRARY_PATH = isNixOS() && execSync("nix eval --raw nixpkgs#gcc.cc.lib").toString("utf-8") + "/lib";

const args = process.argv.slice(2);
execSync(`${getElectronPath()} ${args.join(" ")} --no-sandbox`, {
    stdio: "inherit",
    env: {
        ...process.env,
        NODE_OPTIONS: "--import tsx",
        NODE_ENV: "development",
        TRILIUM_ENV: "dev",
        TRILIUM_RESOURCE_DIR: "../server/src",
        BETTERSQLITE3_NATIVE_PATH: "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
        LD_LIBRARY_PATH
    }
});
