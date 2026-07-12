import { describe, expect, it } from "vitest";

import { loadsEagerly, playerRootClasses, preloadFor, usesCompactControls } from "./media_environment";

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

    it("makes only a preview opt out of link navigation, since its host card is itself a link", () => {
        expect(playerRootClasses("preview")).toBe("media-env-preview media-compact no-link-navigation");
        expect(playerRootClasses("embedded")).toBe("media-env-embedded media-compact");
        expect(playerRootClasses("standalone")).toBe("media-env-standalone");
    });

    it("gives everything but the note detail the compact chrome — nothing else has room for the full set", () => {
        expect(usesCompactControls("preview")).toBe(true);
        expect(usesCompactControls("embedded")).toBe(true);
        expect(usesCompactControls("standalone")).toBe(false);
    });
});
