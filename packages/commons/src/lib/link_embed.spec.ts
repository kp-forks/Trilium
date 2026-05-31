import { describe, expect, it } from "vitest";

import {
    type BlockChildLike,
    chooseLinkPreviewKind,
    extractYouTubeVideoId,
    isUrlAloneInBlock,
    YOUTUBE_REGEX
} from "./link_embed.js";

describe("extractYouTubeVideoId", () => {
    it("extracts the id from a standard watch URL", () => {
        expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts the id from a youtu.be short link", () => {
        expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts the id from an embed URL", () => {
        expect(extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts the id from a shorts URL", () => {
        expect(extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts the id from a watch URL with extra query params around v=", () => {
        expect(
            extractYouTubeVideoId("https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=10s")
        ).toBe("dQw4w9WgXcQ");
    });

    it("returns null for a non-YouTube URL", () => {
        expect(extractYouTubeVideoId("https://example.com/foo")).toBeNull();
    });
});

describe("YOUTUBE_REGEX", () => {
    it("is a RegExp that matches a known YouTube URL", () => {
        expect(YOUTUBE_REGEX).toBeInstanceOf(RegExp);

        const match = "https://www.youtube.com/watch?v=dQw4w9WgXcQ".match(YOUTUBE_REGEX);
        expect(match).not.toBeNull();
        expect(match?.[1]).toBe("dQw4w9WgXcQ");
    });
});

describe("isUrlAloneInBlock", () => {
    const url = "https://youtu.be/dQw4w9WgXcQ";
    const text = (data: string): BlockChildLike => ({ isText: true, data });
    const element = (): BlockChildLike => ({ isText: false });

    it("is true when the URL is the block's only content, ignoring surrounding whitespace", () => {
        // Sole text node.
        expect(isUrlAloneInBlock([text(url)], url)).toBe(true);
        // Trailing space (the character that triggers auto-linking) as its own node.
        expect(isUrlAloneInBlock([text(url), text(" ")], url)).toBe(true);
        // Whitespace-only nodes on either side.
        expect(isUrlAloneInBlock([text("  "), text(url), text("\n")], url)).toBe(true);
        // Adjacent text nodes that together spell the URL.
        expect(isUrlAloneInBlock([text("https://youtu.be/"), text("dQw4w9WgXcQ")], url)).toBe(true);
    });

    it("is false when the URL is surrounded by other text or non-text nodes", () => {
        expect(isUrlAloneInBlock([text("Check out "), text(url)], url)).toBe(false);
        expect(isUrlAloneInBlock([text(url), text(" today")], url)).toBe(false);
        // A non-text node (e.g. an inline image or soft break) disqualifies it.
        expect(isUrlAloneInBlock([text(url), element()], url)).toBe(false);
        expect(isUrlAloneInBlock([element()], url)).toBe(false);
        // An empty block contains nothing, let alone the URL.
        expect(isUrlAloneInBlock([], url)).toBe(false);
    });
});

describe("chooseLinkPreviewKind", () => {
    it("uses a block embed only for an embeddable URL standing alone in its block", () => {
        expect(chooseLinkPreviewKind("youtube", true)).toBe("embed");
        // Embeddable but surrounded by text -> inline mention (a block can't go mid-sentence).
        expect(chooseLinkPreviewKind("youtube", false)).toBe("mention");
        // Non-embeddable URLs are always inline mentions, alone or not.
        expect(chooseLinkPreviewKind("opengraph", true)).toBe("mention");
        expect(chooseLinkPreviewKind("opengraph", false)).toBe("mention");
    });
});
