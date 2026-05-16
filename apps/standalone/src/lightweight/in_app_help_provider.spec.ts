import type { HiddenSubtreeItem } from "@triliumnext/commons";
import { describe, expect, it } from "vitest";

import StandaloneRuntimeInAppHelpProvider from "./in_app_help_provider.js";

describe("StandaloneRuntimeInAppHelpProvider", () => {
    it("returns empty array before init", () => {
        const provider = new StandaloneRuntimeInAppHelpProvider();
        expect(provider.getHelpHiddenSubtreeData()).toEqual([]);
    });

    it("cleanUpHelp is a no-op", () => {
        const provider = new StandaloneRuntimeInAppHelpProvider();
        const items: HiddenSubtreeItem[] = [{ id: "_help_test", title: "Test", type: "webView" }];
        // Should not throw
        provider.cleanUpHelp(items);
    });
});
