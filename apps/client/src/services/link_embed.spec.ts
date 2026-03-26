import { describe, expect, it } from "vitest";
import { extractYouTubeVideoId, detectEmbedType, safeHostname } from "./link_embed.js";

describe("extractYouTubeVideoId", () => {
    it("extracts from standard watch URL", () => {
        expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts from youtu.be short URL", () => {
        expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts from youtu.be with query params", () => {
        expect(extractYouTubeVideoId("https://youtu.be/fV16ck4Bgc0?si=bxl0pGUK2VIfUHkw")).toBe("fV16ck4Bgc0");
    });

    it("extracts from embed URL", () => {
        expect(extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts from shorts URL", () => {
        expect(extractYouTubeVideoId("https://www.youtube.com/shorts/abcde_-FGHI")).toBe("abcde_-FGHI");
    });

    it("extracts from watch URL with extra params", () => {
        expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf")).toBe("dQw4w9WgXcQ");
    });

    it("returns null for non-YouTube URLs", () => {
        expect(extractYouTubeVideoId("https://example.com")).toBeNull();
    });

    it("returns null for empty string", () => {
        expect(extractYouTubeVideoId("")).toBeNull();
    });

    it("returns null for YouTube URL without video ID", () => {
        expect(extractYouTubeVideoId("https://www.youtube.com/")).toBeNull();
    });
});

describe("detectEmbedType", () => {
    it("detects YouTube URLs", () => {
        expect(detectEmbedType("https://youtu.be/fV16ck4Bgc0")).toBe("youtube");
        expect(detectEmbedType("https://www.youtube.com/watch?v=abc12345678")).toBe("youtube");
    });

    it("returns opengraph for non-YouTube URLs", () => {
        expect(detectEmbedType("https://example.com")).toBe("opengraph");
        expect(detectEmbedType("https://github.com/TriliumNext/Notes")).toBe("opengraph");
    });
});

describe("safeHostname", () => {
    it("extracts hostname from valid URL", () => {
        expect(safeHostname("https://www.example.com/page")).toBe("www.example.com");
    });

    it("returns raw string for invalid URL", () => {
        expect(safeHostname("not-a-url")).toBe("not-a-url");
    });

    it("handles URLs with ports", () => {
        expect(safeHostname("http://localhost:8080/api")).toBe("localhost");
    });
});
