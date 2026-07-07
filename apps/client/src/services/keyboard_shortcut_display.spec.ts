import { describe, expect, it, vi } from "vitest";

import {
    formatShortcut,
    formatShortcutKey,
    SHORTCUT_KEY_PREFIX,
    splitShortcutForDisplay,
    type ShortcutKeyTranslator
} from "./keyboard_shortcut_display.js";

/** Fake i18n resolver: uppercases the id and prefixes `L·` so translated output is unmistakable. */
const fakeTranslate: ShortcutKeyTranslator = (id) => `L·${id.toUpperCase()}`;

describe("keyboard_shortcut_display", () => {
    describe("splitShortcutForDisplay", () => {
        it("splits modifiers and the final key, preserving order and casing", () => {
            expect(splitShortcutForDisplay("Ctrl+Shift+J")).toEqual([ "Ctrl", "Shift", "J" ]);
            expect(splitShortcutForDisplay("Alt+Left")).toEqual([ "Alt", "Left" ]);
            expect(splitShortcutForDisplay("F5")).toEqual([ "F5" ]);
        });

        it("keeps punctuation keys as their own token", () => {
            expect(splitShortcutForDisplay("Meta+[")).toEqual([ "Meta", "[" ]);
            expect(splitShortcutForDisplay("Ctrl+=")).toEqual([ "Ctrl", "=" ]);
            expect(splitShortcutForDisplay("Alt+-")).toEqual([ "Alt", "-" ]);
            expect(splitShortcutForDisplay("Ctrl+.")).toEqual([ "Ctrl", "." ]);
        });

        it("handles the plus key encoded as a lone or trailing '+'", () => {
            expect(splitShortcutForDisplay("+")).toEqual([ "+" ]);
            expect(splitShortcutForDisplay("Ctrl++")).toEqual([ "Ctrl", "+" ]);
            expect(splitShortcutForDisplay("Ctrl+Alt++")).toEqual([ "Ctrl", "Alt", "+" ]);
        });

        it("strips a leading global: prefix so it never reaches the display", () => {
            expect(splitShortcutForDisplay("global:Meta+Plus")).toEqual([ "Meta", "Plus" ]);
            expect(splitShortcutForDisplay("global:Ctrl+Alt+P")).toEqual([ "Ctrl", "Alt", "P" ]);
        });

        it("trims surrounding whitespace and returns [] for empty/nullish input", () => {
            expect(splitShortcutForDisplay("  Ctrl+J  ")).toEqual([ "Ctrl", "J" ]);
            expect(splitShortcutForDisplay("")).toEqual([]);
            expect(splitShortcutForDisplay("   ")).toEqual([]);
            expect(splitShortcutForDisplay(undefined as unknown as string)).toEqual([]);
        });
    });

    describe("formatShortcutKey", () => {
        it("resolves modifiers and their aliases through the translator to one id", () => {
            expect(formatShortcutKey("Ctrl", fakeTranslate)).toBe("L·CTRL");
            expect(formatShortcutKey("Control", fakeTranslate)).toBe("L·CTRL");
            expect(formatShortcutKey("CommandOrControl", fakeTranslate)).toBe("L·CTRL");
            expect(formatShortcutKey("Meta", fakeTranslate)).toBe("L·META");
            expect(formatShortcutKey("Cmd", fakeTranslate)).toBe("L·META");
            expect(formatShortcutKey("Command", fakeTranslate)).toBe("L·META");
        });

        it("resolves named-key aliases to one id and matches case-insensitively", () => {
            expect(formatShortcutKey("Enter", fakeTranslate)).toBe("L·ENTER");
            expect(formatShortcutKey("Return", fakeTranslate)).toBe("L·ENTER");
            expect(formatShortcutKey("Del", fakeTranslate)).toBe("L·DELETE");
            expect(formatShortcutKey("delete", fakeTranslate)).toBe("L·DELETE");
            expect(formatShortcutKey("ESC", fakeTranslate)).toBe("L·ESCAPE");
            expect(formatShortcutKey("PageDown", fakeTranslate)).toBe("L·PAGE_DOWN");
        });

        it("renders glyph keys (arrows, plus) as their universal symbol without consulting the translator", () => {
            const translate = vi.fn(fakeTranslate);
            expect(formatShortcutKey("ArrowUp", translate)).toBe("↑");
            expect(formatShortcutKey("up", translate)).toBe("↑");
            expect(formatShortcutKey("Down", translate)).toBe("↓");
            expect(formatShortcutKey("Left", translate)).toBe("←");
            expect(formatShortcutKey("Right", translate)).toBe("→");
            expect(formatShortcutKey("Plus", translate)).toBe("+");
            expect(formatShortcutKey("+", translate)).toBe("+");
            expect(translate).not.toHaveBeenCalled();
        });

        it("passes non-table tokens through verbatim without consulting the translator", () => {
            const translate = vi.fn(fakeTranslate);
            expect(formatShortcutKey("J", translate)).toBe("J");
            expect(formatShortcutKey("5", translate)).toBe("5");
            expect(formatShortcutKey("F11", translate)).toBe("F11");
            expect(formatShortcutKey("[", translate)).toBe("[");
            expect(formatShortcutKey("=", translate)).toBe("=");
            expect(translate).not.toHaveBeenCalled();
        });
    });

    describe("formatShortcut", () => {
        it("resolves translatable tokens and leaves glyph/pass-through tokens intact", () => {
            expect(formatShortcut("Ctrl+Shift+J", fakeTranslate)).toEqual([ "L·CTRL", "L·SHIFT", "J" ]);
            expect(formatShortcut("Alt+Left", fakeTranslate)).toEqual([ "L·ALT", "←" ]);
            expect(formatShortcut("Meta+Plus", fakeTranslate)).toEqual([ "L·META", "+" ]);
            expect(formatShortcut("F5", fakeTranslate)).toEqual([ "F5" ]);
            expect(formatShortcut("Ctrl+Up", fakeTranslate)).toEqual([ "L·CTRL", "↑" ]);
        });

        it("strips global: and normalizes aliases end-to-end", () => {
            expect(formatShortcut("global:CommandOrControl+Alt+P", fakeTranslate)).toEqual([ "L·CTRL", "L·ALT", "P" ]);
            expect(formatShortcut("Cmd+ArrowRight", fakeTranslate)).toEqual([ "L·META", "→" ]);
        });

        it("returns [] for an empty shortcut", () => {
            expect(formatShortcut("", fakeTranslate)).toEqual([]);
        });
    });

    it("exposes the i18n key prefix for the integration layer", () => {
        expect(SHORTCUT_KEY_PREFIX).toBe("keyboard_shortcut_keys");
    });
});
