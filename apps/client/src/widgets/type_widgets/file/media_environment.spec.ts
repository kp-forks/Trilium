import { describe, expect, it } from "vitest";

import { loadsEagerly, preloadFor } from "./media_environment";

describe("media environment", () => {
    it("only a preview is lazy — it must not create a media element until the user asks for one", () => {
        expect(loadsEagerly("preview")).toBe(false);
        expect(loadsEagerly("embedded")).toBe(true);
        expect(loadsEagerly("standalone")).toBe(true);
    });

    it("only the note detail buffers ahead in full", () => {
        expect(preloadFor("standalone")).toBe("auto");
        expect(preloadFor("embedded")).toBe("metadata");
        expect(preloadFor("preview")).toBe("metadata");
    });
});
