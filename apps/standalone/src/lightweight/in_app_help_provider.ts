import type { HiddenSubtreeItem } from "@triliumnext/commons";
import type { InAppHelpProvider } from "@triliumnext/core";

export default class StandaloneInAppHelpProvider implements InAppHelpProvider {

    private cachedData: HiddenSubtreeItem[] | null = null;

    /**
     * Pre-loads the standalone help meta asynchronously.
     * Must be called before `getHelpHiddenSubtreeData()` is invoked.
     */
    async init(): Promise<void> {
        try {
            const response = await fetch("/server-assets/doc_notes/en/User Guide/!!!meta.standalone.json");
            if (response.ok) {
                this.cachedData = await response.json();
            } else {
                console.warn(`[StandaloneInAppHelp] Failed to load meta: HTTP ${response.status}`);
            }
        } catch (e) {
            console.warn("[StandaloneInAppHelp] Failed to load meta:", e);
        }
    }

    getHelpHiddenSubtreeData(): HiddenSubtreeItem[] {
        return this.cachedData ?? [];
    }

    cleanUpHelp(_helpDefinition: HiddenSubtreeItem[]): void {
        // No-op in standalone: the help subtree is always derived from the
        // bundled meta, so there's nothing to clean up.
    }
}
