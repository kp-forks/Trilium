import type { HiddenSubtreeItem } from "@triliumnext/commons";
import { describe, expect, it } from "vitest";

import NodejsInAppHelpProvider from "../in_app_help_provider.js";
import type NoteMeta from "./meta/note_meta.js";

const provider = new NodejsInAppHelpProvider();

describe("In-app help", () => {
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

        const item = provider.parseNoteMeta(meta, "/");
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
        const items = provider.parseNoteMetaFile(metaFile, "https://docs.triliumnotes.org");

        // The root's children are returned, so items[0] is "Feature Highlights"
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
        const items = provider.parseNoteMetaFile(metaFile);

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

        const item = provider.parseNoteMeta(meta, "/");
        expect(item).toBeFalsy();
    });
});

describe("transformForStandalone", () => {
    it("converts doc notes with docUrl to webView notes", () => {
        const items: HiddenSubtreeItem[] = [{
            id: "_help_abc123",
            title: "Test Note",
            type: "doc",
            attributes: [
                { type: "label", name: "docName", value: "User Guide/Test Note" },
                { type: "label", name: "docUrl", value: "https://docs.triliumnotes.org/test-note" },
                { type: "label", name: "iconClass", value: "bx bx-file" }
            ]
        }];

        const result = NodejsInAppHelpProvider.transformForStandalone(items);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("webView");
        expect(result[0].enforceAttributes).toBe(true);
        expect(result[0].attributes).toContainEqual({
            type: "label", name: "webViewSrc", value: "https://docs.triliumnotes.org/test-note"
        });
        expect(result[0].attributes?.find(a => a.name === "docName")).toBeUndefined();
        expect(result[0].attributes?.find(a => a.name === "docUrl")).toBeUndefined();
        expect(result[0].attributes?.find(a => a.name === "iconClass")).toBeDefined();
    });

    it("excludes doc notes without docUrl", () => {
        const items: HiddenSubtreeItem[] = [{
            id: "_help_abc123",
            title: "Offline Only Note",
            type: "doc",
            attributes: [
                { type: "label", name: "docName", value: "User Guide/Offline" },
                { type: "label", name: "iconClass", value: "bx bx-file" }
            ]
        }];

        const result = NodejsInAppHelpProvider.transformForStandalone(items);
        expect(result).toHaveLength(0);
    });

    it("preserves book and webView notes unchanged", () => {
        const items: HiddenSubtreeItem[] = [
            {
                id: "_help_book1",
                title: "Section",
                type: "book",
                attributes: [{ type: "label", name: "iconClass", value: "bx bx-folder" }]
            },
            {
                id: "_help_wv1",
                title: "API Docs",
                type: "webView",
                attributes: [{ type: "label", name: "webViewSrc", value: "/api/docs" }]
            }
        ];

        const result = NodejsInAppHelpProvider.transformForStandalone(items);

        expect(result).toHaveLength(2);
        expect(result[0].type).toBe("book");
        expect(result[1].type).toBe("webView");
    });

    it("recursively transforms children", () => {
        const items: HiddenSubtreeItem[] = [{
            id: "_help_parent",
            title: "Parent",
            type: "book",
            attributes: [{ type: "label", name: "iconClass", value: "bx bx-folder" }],
            children: [
                {
                    id: "_help_child1",
                    title: "Child With URL",
                    type: "doc",
                    attributes: [
                        { type: "label", name: "docName", value: "User Guide/Child" },
                        { type: "label", name: "docUrl", value: "https://docs.triliumnotes.org/child" }
                    ]
                },
                {
                    id: "_help_child2",
                    title: "Child Without URL",
                    type: "doc",
                    attributes: [
                        { type: "label", name: "docName", value: "User Guide/Child2" }
                    ]
                }
            ]
        }];

        const result = NodejsInAppHelpProvider.transformForStandalone(items);

        expect(result).toHaveLength(1);
        expect(result[0].children).toHaveLength(1);
        expect(result[0].children![0].type).toBe("webView");
        expect(result[0].children![0].id).toBe("_help_child1");
    });
});
