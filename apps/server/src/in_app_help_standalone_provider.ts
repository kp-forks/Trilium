import type { HiddenSubtreeItem } from "@triliumnext/commons";

import { AbstractInAppHelpProvider } from "./in_app_help_provider.js";

/**
 * Standalone provider: text notes are rendered as `webView` type pointing to the online docs.
 * Notes without an online URL are excluded (no offline content available).
 *
 * Used at build time (edit-docs) to generate the standalone meta, and at runtime
 * to read that pre-built meta.
 */
export default class StandaloneInAppHelpProvider extends AbstractInAppHelpProvider {

    private cachedData: HiddenSubtreeItem[] | null = null;

    /**
     * Sets the pre-loaded help data (used at runtime after fetching the meta file).
     */
    setData(data: HiddenSubtreeItem[]): void {
        this.cachedData = data;
    }

    getHelpHiddenSubtreeData(): HiddenSubtreeItem[] {
        return this.cachedData ?? [];
    }

    protected handleTextNote(item: HiddenSubtreeItem, _docPath: string, currentUrl: string | undefined): boolean {
        if (!currentUrl) {
            return false;
        }

        item.type = "webView";
        item.enforceAttributes = true;
        item.attributes?.push({
            type: "label",
            name: "webViewSrc",
            value: currentUrl
        });

        return true;
    }
}
