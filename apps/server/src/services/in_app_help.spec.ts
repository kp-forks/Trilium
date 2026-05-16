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
