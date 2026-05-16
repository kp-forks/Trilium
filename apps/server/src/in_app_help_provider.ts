import type { HiddenSubtreeItem } from "@triliumnext/commons";
import type { InAppHelpProvider } from "@triliumnext/core";
import path from "path";

import becca from "./becca/becca.js";
import type BNote from "./becca/entities/bnote.js";
import type NoteMeta from "./services/meta/note_meta.js";
import type { NoteMetaFile } from "./services/meta/note_meta.js";

/**
 * Abstract base class for in-app help providers. Contains shared logic for
 * parsing NoteMetaFile into HiddenSubtreeItem[] and cleaning up stale help notes.
 *
 * Subclasses define how text notes are represented (e.g. doc with offline content,
 * or webView pointing to online docs).
 */
export abstract class AbstractInAppHelpProvider implements InAppHelpProvider {

    abstract getHelpHiddenSubtreeData(): HiddenSubtreeItem[];

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

        // Handle text notes — subclasses decide the representation
        if (noteMeta.type === "text" && noteMeta.dataFileName) {
            const docPath = `${docNameRoot}/${path.basename(noteMeta.dataFileName, ".html")}`.substring(1);
            if (!this.handleTextNote(item, docPath, currentUrl)) {
                return null;
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
                const newDocNameRoot = noteMeta.dirFileName ? `${docNameRoot}/${noteMeta.dirFileName}` : docNameRoot;
                const child = this.parseNoteMeta(childMeta, newDocNameRoot, currentUrl);
                if (child) {
                    children.push(child);
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

    /**
     * Defines how a text note with content is represented in the help tree.
     * @param item the HiddenSubtreeItem being built (mutate in place)
     * @param docPath the documentation path (e.g. "User Guide/Quick Start")
     * @param currentUrl the online URL for this note (if available)
     * @returns true to include the item, false to exclude it
     */
    protected abstract handleTextNote(item: HiddenSubtreeItem, docPath: string, currentUrl: string | undefined): boolean;

    /**
     * Iterates recursively through the help subtree that the user has and compares it against the definition
     * to remove any notes that are no longer present in the latest version of the help.
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

    private getShareAlias(noteMeta: NoteMeta): string | undefined {
        return noteMeta.attributes?.find((a) => a.type === "label" && a.name === "shareAlias")?.value;
    }
}
