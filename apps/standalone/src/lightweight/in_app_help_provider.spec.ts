import { describe, expect, it } from "vitest";

import StandaloneInAppHelpProvider from "./in_app_help_provider.js";

describe("StandaloneInAppHelpProvider", () => {
    it("returns help data from the imported meta", () => {
        const provider = new StandaloneInAppHelpProvider();
        // The placeholder help_meta.json is an empty array
        expect(provider.getHelpHiddenSubtreeData()).toEqual([]);
    });
});
