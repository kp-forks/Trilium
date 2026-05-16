import type { HiddenSubtreeItem } from "@triliumnext/commons";
import type { InAppHelpProvider } from "@triliumnext/core";
import fs from "fs";
import path from "path";

import becca from "./becca/becca.js";
import type BNote from "./becca/entities/bnote.js";
import type NoteMeta from "./services/meta/note_meta.js";
import type { NoteMetaFile } from "./services/meta/note_meta.js";
import { RESOURCE_DIR } from "./services/resource_dir.js";

export default class NodejsInAppHelpProvider implements InAppHelpProvider {

    getHelpHiddenSubtreeData(): HiddenSubtreeItem[] {
        const helpDir = path.join(RESOURCE_DIR, "doc_notes", "en", "User Guide");
        const metaFilePath = path.join(helpDir, "!!!meta.json");

        try {
            return JSON.parse(fs.readFileSync(metaFilePath).toString("utf-8"));
        } catch (e) {
            console.warn(e);
            return [];
        }
    }

    parseNoteMetaFile(noteMetaFile: NoteMetaFile, baseUrl?: string): HiddenSubtreeItem[] {
        if (!noteMetaFile.files) {
            console.warn("No meta files found to parse.");
            return [];
        }

        const metaRoot = noteMetaFile.files[0];
        const parsedMetaRoot = this.parseNoteMeta(metaRoot, "/" + (metaRoot.dirFileName ?? ""), baseUrl);
        return parsedMetaRoot?.children ?? [];
    }

    parseNoteMeta(noteMeta: NoteMeta, docNameRoot: string, parentUrl?: string): HiddenSubtreeItem | null {
        let iconClass: string = "bx bx-file";
        const item: HiddenSubtreeItem = {
            id: `_help_${noteMeta.noteId}`,
            title: noteMeta.title ?? "",
            type: "doc", // can change
            attributes: []
        };

        // Handle folder notes
        if (!noteMeta.dataFileName) {
            iconClass = "bx bx-folder";
            item.type = "book";
        }

        // Build the docUrl for this note
        const shareAlias = this.getShareAlias(noteMeta);
        const currentUrl = parentUrl && shareAlias ? `${parentUrl}/${shareAlias}` : parentUrl;

        // Handle attributes
        for (const attribute of noteMeta.attributes ?? []) {
            if (attribute.name === "iconClass") {
                iconClass = attribute.value;
                continue;
            }

            if (attribute.name === "webViewSrc") {
                item.attributes?.push({
                    type: "label",
                    name: attribute.name,
                    value: attribute.value
                });
            }

            if (attribute.name === "shareHiddenFromTree") {
                return null;
            }
        }

        // Handle text notes
        if (noteMeta.type === "text" && noteMeta.dataFileName) {
            const docPath = `${docNameRoot}/${path.basename(noteMeta.dataFileName, ".html")}`.substring(1);
            item.attributes?.push({
                type: "label",
                name: "docName",
                value: docPath
            });

            if (currentUrl) {
                item.attributes?.push({
                    type: "label",
                    name: "docUrl",
                    value: currentUrl
                });
            }
        }

        // Handle web views
        if (noteMeta.type === "webView") {
            item.type = "webView";
            item.enforceAttributes = true;
        }

        // Handle children
        if (noteMeta.children) {
            const children: HiddenSubtreeItem[] = [];
            for (const childMeta of noteMeta.children) {
                let newDocNameRoot = noteMeta.dirFileName ? `${docNameRoot}/${noteMeta.dirFileName}` : docNameRoot;
                const item = this.parseNoteMeta(childMeta, newDocNameRoot, currentUrl);
                if (item) {
                    children.push(item);
                }
            }

            item.children = children;
        }

        // Handle note icon
        item.attributes?.push({
            name: "iconClass",
            value: iconClass,
            type: "label"
        });

        return item;
    }

    private getShareAlias(noteMeta: NoteMeta): string | undefined {
        return noteMeta.attributes?.find((a) => a.type === "label" && a.name === "shareAlias")?.value;
    }

    /**
     * Transforms the help subtree for standalone mode: converts `doc` notes that have a `docUrl`
     * into `webView` notes with `webViewSrc`, removing the `docName` attribute.
     * Notes of type `doc` without a `docUrl` are excluded since their content isn't available offline.
     */
    static transformForStandalone(items: HiddenSubtreeItem[]): HiddenSubtreeItem[] {
        const result: HiddenSubtreeItem[] = [];
        for (const item of items) {
            const transformed = NodejsInAppHelpProvider.transformItemForStandalone(item);
            if (transformed) {
                result.push(transformed);
            }
        }
        return result;
    }

    private static transformItemForStandalone(item: HiddenSubtreeItem): HiddenSubtreeItem | null {
        const docUrl = item.attributes?.find(a => a.name === "docUrl")?.value;
        const hasDocName = item.attributes?.some(a => a.name === "docName");

        // If it's a doc note with content but no online URL, skip it
        if (item.type === "doc" && hasDocName && !docUrl) {
            return null;
        }

        const newItem: HiddenSubtreeItem = { ...item };

        // Convert doc notes with docUrl to webView notes
        if (item.type === "doc" && hasDocName && docUrl) {
            newItem.type = "webView";
            newItem.enforceAttributes = true;
            newItem.attributes = (item.attributes ?? [])
                .filter(a => a.name !== "docName" && a.name !== "docUrl")
                .concat({ type: "label", name: "webViewSrc", value: docUrl });
        }

        // Recursively transform children
        if (item.children) {
            newItem.children = NodejsInAppHelpProvider.transformForStandalone(item.children);
        }

        return newItem;
    }

    /**
     * Iterates recursively through the help subtree that the user has and compares it against the definition
     * to remove any notes that are no longer present in the latest version of the help.
     *
     * @param helpDefinition the hidden subtree definition for the help, to compare against the user's structure.
     */
    cleanUpHelp(helpDefinition: HiddenSubtreeItem[]): void {
        function getFlatIds(items: HiddenSubtreeItem | HiddenSubtreeItem[]) {
            const ids: (string | string[])[] = [];
            if (Array.isArray(items)) {
                for (const item of items) {
                    ids.push(getFlatIds(item));
                }
            } else {
                if (items.children) {
                    for (const child of items.children) {
                        ids.push(getFlatIds(child));
                    }
                }
                ids.push(items.id);
            }
            return ids.flat();
        }

        function getFlatIdsFromNote(note: BNote | null) {
            if (!note) {
                return [];
            }

            const ids: (string | string[])[] = [];

            for (const subnote of note.getChildNotes()) {
                ids.push(getFlatIdsFromNote(subnote));
            }

            ids.push(note.noteId);
            return ids.flat();
        }

        const definitionHelpIds = new Set(getFlatIds(helpDefinition));
        const realHelpIds = getFlatIdsFromNote(becca.getNote("_help"));

        for (const realHelpId of realHelpIds) {
            if (realHelpId === "_help") {
                continue;
            }

            if (!definitionHelpIds.has(realHelpId)) {
                becca.getNote(realHelpId)?.deleteNote();
            }
        }
    }

}
