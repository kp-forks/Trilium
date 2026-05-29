import { MIME_TYPE_AUTO, MIME_TYPES_DICT, normalizeMimeTypeForCKEditor } from "@triliumnext/commons";
import { describe, expect, it, vi } from "vitest";

import options from "./options.js";
import mimeTypesService, { getHighlightJsNameForMime } from "./mime_types.js";

describe("mime_types service", () => {
    it("getMimeTypes loads lazily, defaults to the dict's `default` set, and always enables text/plain", () => {
        // No user option configured -> fall back to the entries flagged `default`.
        options.getJson = vi.fn(() => null) as typeof options.getJson;

        const mimeTypes = mimeTypesService.getMimeTypes();

        // It is a clone, not the frozen source dictionary.
        expect(mimeTypes).not.toBe(MIME_TYPES_DICT);
        expect(mimeTypes.length).toBe(MIME_TYPES_DICT.length);
        expect(Object.isFrozen(mimeTypes)).toBe(false);

        const enabledMimes = mimeTypes.filter((mt) => mt.enabled).map((mt) => mt.mime);
        const defaultMimes = MIME_TYPES_DICT.filter((mt) => mt.default).map((mt) => mt.mime);
        // Every default mime is enabled, plus text/plain which is forced on.
        for (const mime of defaultMimes) {
            expect(enabledMimes).toContain(mime);
        }
        expect(enabledMimes).toContain("text/plain");

        // A non-default mime (no `default` flag, not text/plain) stays disabled.
        const apl = mimeTypes.find((mt) => mt.mime === "text/apl");
        expect(apl?.enabled).toBe(false);
    });

    it("getMimeTypes returns the already-loaded cache on subsequent calls", () => {
        // getJson must not be consulted again now that the cache is populated.
        const spy = vi.fn(() => null);
        options.getJson = spy as typeof options.getJson;

        const first = mimeTypesService.getMimeTypes();
        const second = mimeTypesService.getMimeTypes();

        expect(second).toBe(first);
        expect(spy).not.toHaveBeenCalled();
    });

    it("loadMimeTypes honours a user-configured enabled list", () => {
        options.getJson = vi.fn(() => ["text/apl"]) as typeof options.getJson;

        mimeTypesService.loadMimeTypes();
        const mimeTypes = mimeTypesService.getMimeTypes();

        const apl = mimeTypes.find((mt) => mt.mime === "text/apl");
        const plain = mimeTypes.find((mt) => mt.mime === "text/plain");
        // A default mime that is NOT in the user list is now disabled.
        const html = mimeTypes.find((mt) => mt.mime === "text/html");

        expect(apl?.enabled).toBe(true);
        // text/plain stays enabled even though it is not in the configured list.
        expect(plain?.enabled).toBe(true);
        expect(html?.enabled).toBe(false);
    });

    it("getHighlightJsNameForMime maps CKEditor-normalized mimes to highlight.js codes and caches the mapping", () => {
        // text/x-csrc -> text-x-csrc -> "c"
        expect(getHighlightJsNameForMime(normalizeMimeTypeForCKEditor("text/x-csrc"))).toBe("c");
        // text/css -> text-css -> "css" (exercises the cached path on the second call)
        expect(getHighlightJsNameForMime(normalizeMimeTypeForCKEditor("text/css"))).toBe("css");
        // A mime that exists but has no mdLanguageCode is omitted from the mapping.
        expect(getHighlightJsNameForMime(normalizeMimeTypeForCKEditor("text/apl"))).toBeUndefined();
        // An entirely unknown mime resolves to undefined.
        expect(getHighlightJsNameForMime("totally-unknown")).toBeUndefined();
    });

    it("re-exports MIME_TYPE_AUTO and the public helpers", () => {
        expect(mimeTypesService.MIME_TYPE_AUTO).toBe(MIME_TYPE_AUTO);
        expect(typeof mimeTypesService.getMimeTypes).toBe("function");
        expect(typeof mimeTypesService.loadMimeTypes).toBe("function");
        expect(mimeTypesService.getHighlightJsNameForMime).toBe(getHighlightJsNameForMime);
    });
});
