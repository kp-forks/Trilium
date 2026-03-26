import { getCrypto } from "../encryption/crypto";
import { sanitizeFileName } from "../sanitizer";
import { encodeBase64 } from "./binary";
import mimeTypes from "mime-types";
import escape from "escape-html";
import unescape from "unescape";

// TODO: Implement platform detection.
export const isElectron = false;
export const isMac = false;
export const isWindows = false;

// render and book are string note in the sense that they are expected to contain empty string
const STRING_NOTE_TYPES = new Set(["text", "code", "relationMap", "search", "render", "book", "mermaid", "canvas", "webView"]);
const STRING_MIME_TYPES = new Set(["application/javascript", "application/x-javascript", "application/json", "application/x-sql", "image/svg+xml"]);

export function hash(text: string) {
    return encodeBase64(getCrypto().createHash("sha1", text.normalize()));
}

export function isStringNote(type: string | undefined, mime: string) {
    return (type && STRING_NOTE_TYPES.has(type)) || mime.startsWith("text/") || STRING_MIME_TYPES.has(mime);
}

// TODO: Refactor to use getCrypto() directly.
export function randomString(length: number) {
    return getCrypto().randomString(length);
}

export function newEntityId() {
    return randomString(12);
}

export function hashedBlobId(content: string | Uint8Array) {
    if (content === null || content === undefined) {
        content = "";
    }

    // sha512 is faster than sha256
    const base64Hash = encodeBase64(getCrypto().createHash("sha512", content));

    // we don't want such + and / in the IDs
    const kindaBase62Hash = base64Hash.replaceAll("+", "X").replaceAll("/", "Y");

    // 20 characters of base62 gives us ~120 bit of entropy which is plenty enough
    return kindaBase62Hash.substr(0, 20);
}

export function quoteRegex(url: string) {
    return url.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&");
}

export function replaceAll(string: string, replaceWhat: string, replaceWith: string) {
    const quotedReplaceWhat = quoteRegex(replaceWhat);

    return string.replace(new RegExp(quotedReplaceWhat, "g"), replaceWith);
}

export function removeDiacritic(str: string) {
    if (!str) {
        return "";
    }
    str = str.toString();
    return str.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function normalize(str: string) {
    return removeDiacritic(str).toLowerCase();
}

/**
 * Normalizes URL by removing trailing slashes and fixing double slashes.
 * Preserves the protocol (http://, https://) but removes trailing slashes from the rest.
 *
 * @param url The URL to normalize
 * @returns The normalized URL without trailing slashes
 */
export function normalizeUrl(url: string | null | undefined): string | null | undefined {
    if (!url || typeof url !== 'string') {
        return url;
    }

    // Trim whitespace
    url = url.trim();

    if (!url) {
        return url;
    }

    // Fix double slashes (except in protocol) first
    url = url.replace(/([^:]\/)\/+/g, '$1');

    // Remove trailing slash, but preserve protocol
    if (url.endsWith('/') && !url.match(/^https?:\/\/$/)) {
        url = url.slice(0, -1);
    }

    return url;
}

export function timeLimit<T>(promise: Promise<T>, limitMs: number, errorMessage?: string): Promise<T> {
    // TriliumNextTODO: since TS avoids this from ever happening – do we need this check?
    if (!promise || !promise.then) {
        // it's not actually a promise
        return promise;
    }

    // better stack trace if created outside of promise
    const errorTimeLimit = new Error(errorMessage || `Process exceeded time limit ${limitMs}`);

    return new Promise((res, rej) => {
        let resolved = false;

        promise
            .then((result) => {
                resolved = true;

                res(result);
            })
            .catch((error) => rej(error));

        setTimeout(() => {
            if (!resolved) {
                rej(errorTimeLimit);
            }
        }, limitMs);
    });
}

export function sanitizeAttributeName(origName: string) {
    const fixedName = origName === "" ? "unnamed" : origName.replace(/[^\p{L}\p{N}_:]/gu, "_");
    // any not allowed character should be replaced with underscore

    return fixedName;
}

export function sanitizeSqlIdentifier(str: string) {
    return str.replace(/[^A-Za-z0-9_]/g, "");
}

export function getContentDisposition(filename: string) {
    const sanitizedFilename = sanitizeFileName(filename).trim() || "file";
    const uriEncodedFilename = encodeURIComponent(sanitizedFilename);
    return `file; filename="${uriEncodedFilename}"; filename*=UTF-8''${uriEncodedFilename}`;
}

export function formatDownloadTitle(fileName: string, type: string | null, mime: string) {
    const fileNameBase = !fileName ? "untitled" : sanitizeFileName(fileName);

    const getExtension = () => {
        if (type === "text") return ".html";
        if (type === "relationMap" || type === "canvas" || type === "search") return ".json";
        if (!mime) return "";

        const mimeLc = mime.toLowerCase();

        // better to just return the current name without a fake extension
        // it's possible that the title still preserves the correct extension anyways
        if (mimeLc === "application/octet-stream") return "";

        // if fileName has an extension matching the mime already - reuse it
        const mimeTypeFromFileName = mimeTypes.lookup(fileName);
        if (mimeTypeFromFileName === mimeLc) return "";

        // as last resort try to get extension from mimeType
        const extensions = mimeTypes.extension(mime);
        return extensions ? `.${extensions}` : "";
    };

    return `${fileNameBase}${getExtension()}`;
}

export function toMap<T extends Record<string, any>>(list: T[], key: keyof T) {
    const map = new Map<string, T>();
    for (const el of list) {
        const keyForMap = el[key];
        if (!keyForMap) continue;
        // TriliumNextTODO: do we need to handle the case when the same key is used?
        // currently this will overwrite the existing entry in the map
        map.set(keyForMap, el);
    }
    return map;
}

export const escapeHtml = escape;

export const unescapeHtml = unescape;

export function randomSecureToken(bytes = 32) {
    return encodeBase64(getCrypto().randomBytes(32));
}

export function safeExtractMessageAndStackFromError(err: unknown): [errMessage: string, errStack: string | undefined] {
    return (err instanceof Error) ? [err.message, err.stack] as const : ["Unknown Error", undefined] as const;
}

export function isEmptyOrWhitespace(str: string | null | undefined) {
    if (!str) return true;
    return str.match(/^ *$/) !== null;
}

export function escapeRegExp(str: string) {
    return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}
