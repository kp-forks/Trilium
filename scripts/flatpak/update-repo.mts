/**
 * Writes the Flathub packaging repo's files from their vendored sources in
 * `apps/desktop/flatpak/`: the manifest — with its git source pinned to the
 * requested ref and its pnpm sources tracking that ref's `packageManager` —
 * plus the launch wrapper, desktop file and metainfo.
 *
 * Usage:
 *
 *   pnpm exec tsx ./scripts/flatpak/update-repo.mts <packaging-repo-dir> [ref]
 *
 * `ref` defaults to HEAD; a tag pins `tag:` and `commit:`, anything else pins
 * the bare commit (the beta case). `generated-sources.json` is a separate
 * step: ./scripts/flatpak/generate-sources.mts, run against the same ref's
 * checkout.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const FLATPAK_DIR = join(import.meta.dirname, "../../apps/desktop/flatpak");
const MANIFEST_NAME = "org.triliumnotes.Trilium.yml";
const COPIED_FILES = [
    "trilium.sh",
    "org.triliumnotes.Trilium.desktop",
    "org.triliumnotes.Trilium.metainfo.xml"
];

export async function main(argv: string[]) {
    const [repoDirArg, ref = "HEAD"] = argv;
    if (!repoDirArg || !statSync(resolve(repoDirArg), { throwIfNoEntry: false })?.isDirectory()) {
        throw new Error("Pass the packaging repo checkout to update.");
    }
    const repoDir = resolve(repoDirArg);

    const commit = git("rev-parse", `${ref}^{commit}`);
    const tag = isTag(ref) ? ref : undefined;

    let manifest = updateGitSource(readFileSync(join(FLATPAK_DIR, MANIFEST_NAME), "utf-8"), commit, tag);

    const pnpmVersion = parsePnpmVersion(git("show", `${commit}:package.json`));
    if (getPnpmVersion(manifest) !== pnpmVersion) {
        manifest = updatePnpmPins(manifest, pnpmVersion, {
            x64: await sha256OfUrl(pnpmExeUrl("x64", pnpmVersion)),
            arm64: await sha256OfUrl(pnpmExeUrl("arm64", pnpmVersion))
        });
    }

    writeFileSync(join(repoDir, MANIFEST_NAME), manifest);
    for (const file of COPIED_FILES) {
        copyFileSync(join(FLATPAK_DIR, file), join(repoDir, file));
    }
    console.log(`Updated ${repoDir}: ${tag ?? "beta"} @ ${commit}, pnpm ${pnpmVersion}, `
        + `${COPIED_FILES.length + 1} files.`);
}

/** Pins the manifest's git source; without a tag, the `tag:` line goes (a beta builds a bare commit). */
export function updateGitSource(manifest: string, commit: string, tag?: string): string {
    const gitSource = /(url: https:\/\/github\.com\/TriliumNext\/Trilium\.git\n)(\s*tag: \S+\n)?(\s*)commit: [0-9a-f]{40}/;
    if (!gitSource.test(manifest)) {
        throw new Error("Found no Trilium git source to pin in the manifest.");
    }
    return manifest.replace(gitSource, (_, urlLine: string, _tagLine: string, indent: string) =>
        `${urlLine}${tag ? `${indent}tag: ${tag}\n` : ""}${indent}commit: ${commit}`);
}

/** The version the manifest's per-arch pnpm sources currently pin. */
export function getPnpmVersion(manifest: string): string {
    const url = /exe\.linux-x64-([\d.]+)\.tgz/.exec(manifest);
    if (!url) {
        throw new Error("Found no pnpm source in the manifest.");
    }
    return url[1];
}

export function parsePnpmVersion(packageJson: string): string {
    const { packageManager } = JSON.parse(packageJson);
    const version = /^pnpm@([\d.]+)/.exec(packageManager ?? "")?.[1];
    if (!version) {
        throw new Error(`Expected package.json to pin pnpm, got "${packageManager}".`);
    }
    return version;
}

export function updatePnpmPins(
    manifest: string,
    version: string,
    hashes: { x64: string; arm64: string }
): string {
    let updated = manifest;
    for (const arch of ["x64", "arm64"] as const) {
        const source = new RegExp(
            `(exe\\.linux-${arch}/-/exe\\.linux-${arch}-)[\\d.]+(\\.tgz\\n\\s*sha256: )[0-9a-f]{64}`);
        if (!source.test(updated)) {
            throw new Error(`Found no pnpm source for ${arch} in the manifest.`);
        }
        updated = updated.replace(source, `$1${version}$2${hashes[arch]}`);
    }
    return updated;
}

function pnpmExeUrl(arch: "x64" | "arm64", version: string): string {
    return `https://registry.npmjs.org/@pnpm/exe.linux-${arch}/-/exe.linux-${arch}-${version}.tgz`;
}

async function sha256OfUrl(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${response.status} fetching ${url}`);
    }
    return createHash("sha256").update(new Uint8Array(await response.arrayBuffer())).digest("hex");
}

function git(...args: string[]): string {
    return execFileSync("git", args, { cwd: join(import.meta.dirname, "../..") }).toString().trim();
}

function isTag(ref: string): boolean {
    try {
        git("show-ref", "--verify", "--quiet", `refs/tags/${ref}`);
        return true;
    } catch {
        return false;
    }
}

// Only when run as a script — the pure helpers above are imported by the spec.
if (process.argv[1] === import.meta.filename) {
    main(process.argv.slice(2)).catch((err) => {
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
    });
}
