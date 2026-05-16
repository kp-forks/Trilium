import type { HiddenSubtreeItem } from "@triliumnext/commons";
import fs from "fs";
import path from "path";

import { AbstractInAppHelpProvider } from "./in_app_help_provider.js";
import { RESOURCE_DIR } from "./services/resource_dir.js";

/**
 * Server provider: text notes are rendered offline as `doc` type with `docName` attribute,
 * and optionally a `docUrl` for linking to the online version.
 */
export default class NodejsInAppHelpProvider extends AbstractInAppHelpProvider {

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

    protected handleTextNote(item: HiddenSubtreeItem, docPath: string, currentUrl: string | undefined): boolean {
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

        return true;
    }
}
