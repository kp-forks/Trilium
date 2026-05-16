import { describe, expect, it } from "vitest";

import NodejsInAppHelpProvider from "../in_app_help_server_provider.js";
import StandaloneInAppHelpProvider from "../in_app_help_standalone_provider.js";
import type NoteMeta from "./meta/note_meta.js";

const serverProvider = new NodejsInAppHelpProvider();
const standaloneProvider = new StandaloneInAppHelpProvider();

describe("In-app help (server provider)", () => {
    it("preserves custom folder icon", () => {
        const meta: NoteMeta = {
            isClone: false,
            noteId: "yoAe4jV2yzbd",
            notePath: [ "OkOZllzB3fqN", "yoAe4jV2yzbd" ],
            title: "Features",
            notePosition: 40,
            prefix: null,
            isExpanded: false,
            type: "text",
            mime: "text/html",
            attributes: [
                {
                    type: "label",
                    name: "iconClass",
                    value: "bx bx-star",
                    isInheritable: false,
                    position: 10
                }
            ],
            format: "html",
            attachments: [],
            dirFileName: "Features",
            children: []
        };

        const item = serverProvider.parseNoteMeta(meta, "/");
        const icon = item?.attributes?.find((a) => a.name === "iconClass");
        expect(icon?.value).toBe("bx bx-star");
    });

    it("generates docUrl from shareAlias when baseUrl is provided", () => {
        const meta: NoteMeta = {
            isClone: false,
            noteId: "rootNote123",
            notePath: [ "rootNote123" ],
            title: "User Guide",
            notePosition: 1,
            prefix: null,
            isExpanded: false,
            type: "text",
            mime: "text/html",
            attributes: [
                {
                    type: "label",
                    name: "shareAlias",
                    value: "user-guide",
                    isInheritable: false,
                    position: 10
                }
            ],
            format: "html",
            dataFileName: "User Guide.html",
            dirFileName: "User Guide",
            attachments: [],
            children: [
                {
                    isClone: false,
                    noteId: "childNote456",
                    notePath: [ "rootNote123", "childNote456" ],
                    title: "Feature Highlights",
                    notePosition: 10,
                    prefix: null,
                    isExpanded: false,
                    type: "text",
                    mime: "text/html",
                    attributes: [
                        {
                            type: "label",
                            name: "shareAlias",
                            value: "feature-highlights",
                            isInheritable: false,
                            position: 10
                        }
                    ],
                    format: "html",
                    dataFileName: "Feature Highlights.html",
                    attachments: [],
                    children: []
                }
            ]
        };

        const metaFile = { formatVersion: 2, appVersion: "0.103.0", files: [meta] };
        const items = serverProvider.parseNoteMetaFile(metaFile, "https://docs.triliumnotes.org");

        const child = items[0];
        const docUrl = child?.attributes?.find((a) => a.name === "docUrl");
        expect(docUrl?.value).toBe("https://docs.triliumnotes.org/user-guide/feature-highlights");
    });

    it("omits docUrl when no baseUrl is provided", () => {
        const meta: NoteMeta = {
            isClone: false,
            noteId: "rootNote123",
            notePath: [ "rootNote123" ],
            title: "User Guide",
            notePosition: 1,
            prefix: null,
            isExpanded: false,
            type: "text",
            mime: "text/html",
            attributes: [
                {
                    type: "label",
                    name: "shareAlias",
                    value: "user-guide",
                    isInheritable: false,
                    position: 10
                }
            ],
            format: "html",
            dataFileName: "User Guide.html",
            dirFileName: "User Guide",
            attachments: [],
            children: [
                {
                    isClone: false,
                    noteId: "childNote456",
                    notePath: [ "rootNote123", "childNote456" ],
                    title: "Feature Highlights",
                    notePosition: 10,
                    prefix: null,
                    isExpanded: false,
                    type: "text",
                    mime: "text/html",
                    attributes: [
                        {
                            type: "label",
                            name: "shareAlias",
                            value: "feature-highlights",
                            isInheritable: false,
                            position: 10
                        }
                    ],
                    format: "html",
                    dataFileName: "Feature Highlights.html",
                    attachments: [],
                    children: []
                }
            ]
        };

        const metaFile = { formatVersion: 2, appVersion: "0.103.0", files: [meta] };
        const items = serverProvider.parseNoteMetaFile(metaFile);

        const child = items[0];
        const docUrl = child?.attributes?.find((a) => a.name === "docUrl");
        expect(docUrl).toBeUndefined();
    });

    it("hides note that is hidden from share tree", () => {
        const meta: NoteMeta = {
            isClone: false,
            noteId: "yoAe4jV2yzbd",
            notePath: [ "OkOZllzB3fqN", "yoAe4jV2yzbd" ],
            title: "Features",
            notePosition: 40,
            prefix: null,
            isExpanded: false,
            type: "text",
            mime: "text/html",
            attributes: [
                {
                    type: "label",
                    name: "shareHiddenFromTree",
                    value: "",
                    isInheritable: false,
                    position: 10
                }
            ],
            format: "html",
            attachments: [],
            dirFileName: "Features",
            children: []
        };

        const item = serverProvider.parseNoteMeta(meta, "/");
        expect(item).toBeFalsy();
    });
});

describe("In-app help (standalone provider)", () => {
    it("converts text notes with URL to webView", () => {
        const meta: NoteMeta = {
            isClone: false,
            noteId: "childNote456",
            notePath: [ "rootNote123", "childNote456" ],
            title: "Feature Highlights",
            notePosition: 10,
            prefix: null,
            isExpanded: false,
            type: "text",
            mime: "text/html",
            attributes: [
                {
                    type: "label",
                    name: "shareAlias",
                    value: "feature-highlights",
                    isInheritable: false,
                    position: 10
                }
            ],
            format: "html",
            dataFileName: "Feature Highlights.html",
            attachments: [],
            children: []
        };

        const item = standaloneProvider.parseNoteMeta(meta, "/", "https://docs.triliumnotes.org");

        expect(item).not.toBeNull();
        expect(item!.type).toBe("webView");
        expect(item!.enforceAttributes).toBe(true);
        expect(item!.attributes).toContainEqual({
            type: "label", name: "webViewSrc", value: "https://docs.triliumnotes.org/feature-highlights"
        });
        expect(item!.attributes?.find(a => a.name === "docName")).toBeUndefined();
    });

    it("excludes text notes without URL", () => {
        const meta: NoteMeta = {
            isClone: false,
            noteId: "childNote456",
            notePath: [ "rootNote123", "childNote456" ],
            title: "Feature Highlights",
            notePosition: 10,
            prefix: null,
            isExpanded: false,
            type: "text",
            mime: "text/html",
            attributes: [],
            format: "html",
            dataFileName: "Feature Highlights.html",
            attachments: [],
            children: []
        };

        const item = standaloneProvider.parseNoteMeta(meta, "/");
        expect(item).toBeNull();
    });

    it("preserves folder notes", () => {
        const meta: NoteMeta = {
            isClone: false,
            noteId: "folderNote",
            notePath: [ "folderNote" ],
            title: "Section",
            notePosition: 1,
            prefix: null,
            isExpanded: false,
            type: "text",
            mime: "text/html",
            attributes: [],
            format: "html",
            attachments: [],
            dirFileName: "Section",
            children: []
        };

        const item = standaloneProvider.parseNoteMeta(meta, "/");
        expect(item).not.toBeNull();
        expect(item!.type).toBe("book");
    });

    it("excludes children without URL when no baseUrl provided", () => {
        const meta: NoteMeta = {
            isClone: false,
            noteId: "rootNote123",
            notePath: [ "rootNote123" ],
            title: "User Guide",
            notePosition: 1,
            prefix: null,
            isExpanded: false,
            type: "text",
            mime: "text/html",
            attributes: [],
            format: "html",
            dirFileName: "User Guide",
            attachments: [],
            children: [
                {
                    isClone: false,
                    noteId: "childNote",
                    notePath: [ "rootNote123", "childNote" ],
                    title: "Some Page",
                    notePosition: 10,
                    prefix: null,
                    isExpanded: false,
                    type: "text",
                    mime: "text/html",
                    attributes: [],
                    format: "html",
                    dataFileName: "Some Page.html",
                    attachments: [],
                    children: []
                }
            ]
        };

        const metaFile = { formatVersion: 2, appVersion: "0.103.0", files: [meta] };
        // No baseUrl → no URLs for any notes → all text notes excluded
        const items = standaloneProvider.parseNoteMetaFile(metaFile);

        expect(items).toHaveLength(0);
    });
});
