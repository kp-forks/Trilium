import { describe, expect, it } from "vitest";

import { type AutoAdvanceNavigation, getAutoAdvanceTarget, MEDIA_PLAY_MODES, type MediaPlayMode, playModeFromLabel, playModeToLabel, shouldLoop } from "./media_play_mode";

describe("getAutoAdvanceTarget", () => {
    const nav = (index: number, total: number, nextId: string): AutoAdvanceNavigation => ({ index, total, nextId });

    it("advances to the following sibling when the parent is in auto mode", () => {
        expect(getAutoAdvanceTarget("auto", nav(1, 3, "b"))).toBe("b");
        expect(getAutoAdvanceTarget("auto", nav(2, 3, "c"))).toBe("c");
    });

    it("stops at the last sibling instead of wrapping back to the first", () => {
        // nextId wraps to the first sibling here, but auto-advance must not loop the folder.
        expect(getAutoAdvanceTarget("auto", nav(3, 3, "a"))).toBeNull();
    });

    it("does not advance unless the play mode is exactly \"auto\"", () => {
        const navigation = nav(1, 3, "b");
        expect(getAutoAdvanceTarget(undefined, navigation)).toBeNull();
        expect(getAutoAdvanceTarget(null, navigation)).toBeNull();
        expect(getAutoAdvanceTarget("", navigation)).toBeNull();
        expect(getAutoAdvanceTarget("manual", navigation)).toBeNull();
        expect(getAutoAdvanceTarget("Auto", navigation)).toBeNull();
    });

    it("does not advance when there is no sibling navigation (a lone item or none)", () => {
        expect(getAutoAdvanceTarget("auto", null)).toBeNull();
    });
});

describe("playModeFromLabel", () => {
    it("maps the parent's label value to a mode", () => {
        expect(playModeFromLabel("loop")).toBe("loop");
        expect(playModeFromLabel("auto")).toBe("auto");
    });

    it("treats a missing or unrecognised label as play-once", () => {
        expect(playModeFromLabel(null)).toBe("once");
        expect(playModeFromLabel(undefined)).toBe("once");
        expect(playModeFromLabel("")).toBe("once");
        expect(playModeFromLabel("once")).toBe("once");
        expect(playModeFromLabel("bogus")).toBe("once");
    });
});

describe("playModeToLabel", () => {
    it("removes the label for play-once and writes the value otherwise", () => {
        expect(playModeToLabel("once")).toBeNull();
        expect(playModeToLabel("loop")).toBe("loop");
        expect(playModeToLabel("auto")).toBe("auto");
    });

    it("round-trips with playModeFromLabel for every mode", () => {
        for (const mode of MEDIA_PLAY_MODES) {
            expect(playModeFromLabel(playModeToLabel(mode))).toBe(mode);
        }
    });
});

describe("shouldLoop", () => {
    it("loops only in loop mode", () => {
        const looping: Record<MediaPlayMode, boolean> = { once: false, loop: true, auto: false };
        for (const mode of MEDIA_PLAY_MODES) {
            expect(shouldLoop(mode)).toBe(looping[mode]);
        }
    });
});
