import { describe, expect, it } from "vitest";

import { getParentFromNotePath, getSiblingNavigation } from "./sibling_navigation";

describe("getParentFromNotePath", () => {
    it("splits the in-tab path into parent path + parent note id", () => {
        expect(getParentFromNotePath("root/abc/def/xyz")).toEqual({ parentPath: "root/abc/def", parentNoteId: "def" });
        expect(getParentFromNotePath("root/xyz")).toEqual({ parentPath: "root", parentNoteId: "root" });
    });

    it("returns null for a rootless or empty path", () => {
        expect(getParentFromNotePath("xyz")).toBeNull();
        expect(getParentFromNotePath("")).toBeNull();
        expect(getParentFromNotePath(null)).toBeNull();
        expect(getParentFromNotePath(undefined)).toBeNull();
    });
});

describe("getSiblingNavigation", () => {
    it("returns the adjacent siblings with a 1-based index and total", () => {
        expect(getSiblingNavigation([ "a", "b", "c" ], "b")).toEqual({ previous: "a", next: "c", index: 2, total: 3 });
    });

    it("wraps around infinitely at both ends", () => {
        expect(getSiblingNavigation([ "a", "b", "c" ], "a")).toEqual({ previous: "c", next: "b", index: 1, total: 3 });
        expect(getSiblingNavigation([ "a", "b", "c" ], "c")).toEqual({ previous: "b", next: "a", index: 3, total: 3 });
    });

    it("wraps to the other sibling with exactly two", () => {
        expect(getSiblingNavigation([ "a", "b" ], "a")).toEqual({ previous: "b", next: "b", index: 1, total: 2 });
    });

    it("returns null with fewer than two siblings or when the note is absent", () => {
        expect(getSiblingNavigation([ "a" ], "a")).toBeNull();
        expect(getSiblingNavigation([], "a")).toBeNull();
        expect(getSiblingNavigation([ "a", "b" ], "x")).toBeNull();
    });
});
