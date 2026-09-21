import { describe, expect, it } from "vitest";

import { getPnpmVersion, parsePnpmVersion, updateGitSource, updatePnpmPins } from "./update-repo.mjs";

const MANIFEST = `\
modules:
  - name: trilium
    sources:
      - type: git
        url: https://github.com/TriliumNext/Trilium.git
        tag: v0.105.0
        commit: a0908a6e1e1741a3c3824d803da07300183dcb0c
      - generated-sources.json
      - type: archive
        url: https://registry.npmjs.org/@pnpm/exe.linux-x64/-/exe.linux-x64-12.4.2.tgz
        sha256: 545b89d5c6026ac33d4c28bd3c6cc38cc050d571b35a4e69f13aad4a441af142
        dest: flatpak-node/pnpm
        only-arches: [x86_64]
      - type: archive
        url: https://registry.npmjs.org/@pnpm/exe.linux-arm64/-/exe.linux-arm64-12.4.2.tgz
        sha256: c3bb8caba00f308733b0876d245e1e1f3ad656e6605f4f85dd861457267ae9f2
        dest: flatpak-node/pnpm
        only-arches: [aarch64]
`;

const NEW_COMMIT = "1234567890abcdef1234567890abcdef12345678";

describe("updateGitSource", () => {
    it("pins a release: tag and commit both move", () => {
        const updated = updateGitSource(MANIFEST, NEW_COMMIT, "v0.106.0");
        expect(updated).toContain(`        tag: v0.106.0\n        commit: ${NEW_COMMIT}`);
        expect(updated).not.toContain("v0.105.0");
    });

    it("pins a beta: the tag line goes, only the commit stays", () => {
        const updated = updateGitSource(MANIFEST, NEW_COMMIT);
        expect(updated).toContain(`Trilium.git\n        commit: ${NEW_COMMIT}`);
        expect(updated).not.toContain("tag:");
    });

    it("re-adds a tag to a commit-only manifest", () => {
        const beta = updateGitSource(MANIFEST, NEW_COMMIT);
        const release = updateGitSource(beta, NEW_COMMIT, "v0.106.0");
        expect(release).toContain(`        tag: v0.106.0\n        commit: ${NEW_COMMIT}`);
    });

    it("rejects a manifest without the git source", () => {
        expect(() => updateGitSource("modules: []", NEW_COMMIT)).toThrow(/git source/);
    });
});

describe("pnpm pins", () => {
    it("reads the pinned version", () => {
        expect(getPnpmVersion(MANIFEST)).toBe("12.4.2");
    });

    it("parses packageManager, with or without a corepack checksum", () => {
        expect(parsePnpmVersion(`{ "packageManager": "pnpm@12.5.0" }`)).toBe("12.5.0");
        expect(parsePnpmVersion(`{ "packageManager": "pnpm@12.5.0+sha512.abc" }`)).toBe("12.5.0");
        expect(() => parsePnpmVersion(`{ "packageManager": "yarn@4.9.1" }`)).toThrow(/yarn@4.9.1/);
        expect(() => parsePnpmVersion(`{}`)).toThrow(/undefined/);
    });

    it("moves both per-arch sources to the new version and hashes", () => {
        const updated = updatePnpmPins(MANIFEST, "12.5.0", {
            x64: "a".repeat(64),
            arm64: "b".repeat(64)
        });
        expect(updated).toContain(`exe.linux-x64-12.5.0.tgz\n        sha256: ${"a".repeat(64)}`);
        expect(updated).toContain(`exe.linux-arm64-12.5.0.tgz\n        sha256: ${"b".repeat(64)}`);
        expect(updated).not.toContain("12.4.2");
    });

    it("rejects a manifest missing a per-arch source", () => {
        const withoutArm = MANIFEST.replace("exe.linux-arm64", "exe.linux-mips");
        expect(() => updatePnpmPins(withoutArm, "12.5.0", { x64: "a".repeat(64), arm64: "b".repeat(64) }))
            .toThrow(/arm64/);
    });
});
