// Regenerates src/type_completion/jquery/jquery-globals.d.ts.txt — the global
// jQuery type declarations fed to the language service for FRONTEND script notes
// (so `$(…)` and the `JQuery` type resolve).
//
// `@types/jquery@4` is a module (`export = jQuery`) whose `exports` map hides the
// internal .d.ts subpaths, so Vite can't `?raw`-import them like the TypeScript
// libs. Instead we vendor their content here as a single raw text asset. The
// `.d.ts.txt` extension keeps tsc from picking it up as an ambient declaration
// for the package itself; it's only injected into the script-note vfs.
//
// Run from the package root after bumping `@types/jquery`:
//   node scripts/generate_jquery_types.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("@types/jquery/package.json"));
const OUT = new URL("../src/type_completion/jquery/jquery-globals.d.ts.txt", import.meta.url);

// index.d.ts is the module wrapper; its `/// <reference path="…" />` lines point
// to the files that actually declare the global `JQuery*` interfaces.
const index = readFileSync(join(pkgDir, "index.d.ts"), "utf8");
const refs = [...index.matchAll(/\/\/\/\s*<reference\s+path=["']([^"']+)["']\s*\/>/g)].map((m) => m[1]);

let out = "// AUTO-GENERATED — do not edit by hand. Vendored from @types/jquery by\n";
out += "// scripts/generate_jquery_types.mjs. Injected into the frontend script-note vfs.\n\n";
for (const ref of refs) {
    out += `// ===== @types/jquery/${ref} =====\n`;
    out += readFileSync(join(pkgDir, ref), "utf8").trimEnd() + "\n\n";
}
// Trilium exposes jQuery as the `$` / `jQuery` globals (see the client's types.d.ts).
out += "// ===== Trilium globals =====\n";
out += "declare const $: JQueryStatic;\n";
out += "declare const jQuery: JQueryStatic;\n";

mkdirSync(dirname(OUT.pathname), { recursive: true });
writeFileSync(OUT, out);
console.log(`Wrote ${refs.length} jQuery files + globals to ${OUT.pathname}`);
