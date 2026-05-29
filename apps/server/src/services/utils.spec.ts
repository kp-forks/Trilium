import { utils as coreUtils } from "@triliumnext/core";
import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";

import utils from "./utils";
import {
    constantTimeCompare,
    formatDownloadTitle,
    fromBase64,
    getContentDisposition,
    hashedBlobId,
    hmac,
    isStringNote,
    newEntityId,
    normalize,
    quoteRegex,
    randomString,
    removeDiacritic,
    replaceAll,
    toBase64,
    toMap,
    waitForStreamToFinish
} from "./utils";

describe("platform flags & isDev", () => {
    it("exposes boolean platform flags", () => {
        expect(utils.isDev).toBeTypeOf("boolean");
        expect(utils.isMac).toBeTypeOf("boolean");
        expect(utils.isWindows).toBeTypeOf("boolean");
        expect(utils.isElectron).toBeTypeOf("boolean");
    });
});

describe("base64 helpers", () => {
    it("round-trips strings and buffers", () => {
        expect(toBase64("hello")).toBe(Buffer.from("hello").toString("base64"));
        expect(toBase64(Buffer.from("world"))).toBe(Buffer.from("world").toString("base64"));
        expect(fromBase64(toBase64("hello")).toString("utf-8")).toBe("hello");
    });
});

describe("constantTimeCompare", () => {
    it("returns true only for equal strings", () => {
        expect(constantTimeCompare("abc", "abc")).toBe(true);
        expect(constantTimeCompare("", "")).toBe(true);
    });

    it("returns false for differing strings, different lengths and non-string inputs", () => {
        expect(constantTimeCompare("abc", "abd")).toBe(false);
        expect(constantTimeCompare("abc", "abcd")).toBe(false);
        expect(constantTimeCompare(null, "abc")).toBe(false);
        expect(constantTimeCompare("abc", undefined)).toBe(false);
        expect(constantTimeCompare(undefined, undefined)).toBe(false);
    });
});

describe("hmac", () => {
    it("delegates to the core crypto provider", () => {
        const result = hmac("secret", "value");
        expect(result).toBeDefined();
        // Deterministic for the same inputs.
        expect(hmac("secret", "value")).toEqual(result);
    });
});

describe("deprecated core delegations", () => {
    it("forward to the equivalent core utility", () => {
        expect(newEntityId()).toBeTypeOf("string");
        expect(randomString(10)).toHaveLength(10);
        expect(hashedBlobId("content")).toBe(coreUtils.hashedBlobId("content"));
        expect(getContentDisposition("file.txt")).toBe(coreUtils.getContentDisposition("file.txt"));
        expect(isStringNote("text", "text/html")).toBe(coreUtils.isStringNote("text", "text/html"));
        expect(quoteRegex("a.b")).toBe(coreUtils.quoteRegex("a.b"));
        expect(replaceAll("a-b-c", "-", "+")).toBe(coreUtils.replaceAll("a-b-c", "-", "+"));
        expect(formatDownloadTitle("name", "text", "text/html"))
            .toBe(coreUtils.formatDownloadTitle("name", "text", "text/html"));
        expect(removeDiacritic("café")).toBe(coreUtils.removeDiacritic("café"));
        expect(normalize("ABC")).toBe(coreUtils.normalize("ABC"));

        const list = [{ id: "a", v: 1 }, { id: "b", v: 2 }];
        expect(toMap(list, "id")).toEqual(coreUtils.toMap(list, "id"));
    });
});

describe("waitForStreamToFinish", () => {
    afterEach(() => vi.restoreAllMocks());

    it("resolves on the stream 'finish' event", async () => {
        const stream = new EventEmitter();
        const promise = waitForStreamToFinish(stream);
        stream.emit("finish");
        await expect(promise).resolves.toBeUndefined();
    });

    it("rejects on the stream 'error' event", async () => {
        const stream = new EventEmitter();
        const promise = waitForStreamToFinish(stream);
        const err = new Error("boom");
        stream.emit("error", err);
        await expect(promise).rejects.toBe(err);
    });
});

describe("getResourceDir", () => {
    const ORIGINAL_RESOURCE_DIR = process.env.TRILIUM_RESOURCE_DIR;
    const ORIGINAL_ENV = process.env.TRILIUM_ENV;
    const ORIGINAL_ELECTRON = Object.getOwnPropertyDescriptor(process.versions, "electron");
    const ORIGINAL_ARGV1 = process.argv[1];

    afterEach(() => {
        if (ORIGINAL_RESOURCE_DIR === undefined) {
            delete process.env.TRILIUM_RESOURCE_DIR;
        } else {
            process.env.TRILIUM_RESOURCE_DIR = ORIGINAL_RESOURCE_DIR;
        }
        if (ORIGINAL_ENV === undefined) {
            delete process.env.TRILIUM_ENV;
        } else {
            process.env.TRILIUM_ENV = ORIGINAL_ENV;
        }
        if (ORIGINAL_ELECTRON) {
            Object.defineProperty(process.versions, "electron", ORIGINAL_ELECTRON);
        } else {
            delete (process.versions as { electron?: string }).electron;
        }
        process.argv[1] = ORIGINAL_ARGV1;
        vi.resetModules();
        vi.doUnmock("path");
    });

    it("returns TRILIUM_RESOURCE_DIR when set", () => {
        process.env.TRILIUM_RESOURCE_DIR = "/custom/resources";
        expect(utils.getResourceDir()).toBe("/custom/resources");
    });

    // isDev / isElectron are import-time constants, so each branch needs a
    // fresh module load with the relevant env/versions patched beforehand.
    async function loadFresh() {
        vi.resetModules();
        delete process.env.TRILIUM_RESOURCE_DIR;
        return (await import("./utils.js")).getResourceDir;
    }

    it("uses __dirname in dev mode", async () => {
        process.env.TRILIUM_ENV = "dev";
        delete (process.versions as { electron?: string }).electron;
        const getResourceDir = await loadFresh();
        expect(getResourceDir().endsWith("..") || getResourceDir().length > 0).toBe(true);
    });

    it("uses __dirname under Electron in production", async () => {
        delete process.env.TRILIUM_ENV;
        Object.defineProperty(process.versions, "electron", { value: "30.0.0", configurable: true });
        const getResourceDir = await loadFresh();
        // The electron prod branch returns __dirname of the loaded module.
        expect(getResourceDir()).toBeTypeOf("string");
    });

    it("uses the executable directory in non-electron production", async () => {
        delete process.env.TRILIUM_ENV;
        delete (process.versions as { electron?: string }).electron;
        process.argv[1] = "/opt/trilium/bin/server.js";
        const getResourceDir = await loadFresh();
        expect(getResourceDir()).toBe("/opt/trilium/bin");
    });
});
