import { describe, expect, it } from "vitest";

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
        it("maps modifiers and their aliases to a single canonical English label", () => {
            expect(formatShortcutKey("Ctrl")).toBe("Ctrl");
            expect(formatShortcutKey("Control")).toBe("Ctrl");
            expect(formatShortcutKey("CommandOrControl")).toBe("Ctrl");
            expect(formatShortcutKey("Meta")).toBe("Meta");
            expect(formatShortcutKey("Cmd")).toBe("Meta");
            expect(formatShortcutKey("Command")).toBe("Meta");
        });

        it("maps named-key aliases to one label and matches case-insensitively", () => {
            expect(formatShortcutKey("Enter")).toBe("Enter");
            expect(formatShortcutKey("Return")).toBe("Enter");
            expect(formatShortcutKey("Del")).toBe("Delete");
            expect(formatShortcutKey("delete")).toBe("Delete");
            expect(formatShortcutKey("ESC")).toBe("Esc");
            expect(formatShortcutKey("ArrowUp")).toBe("Up");
            expect(formatShortcutKey("up")).toBe("Up");
            expect(formatShortcutKey("PageDown")).toBe("Page Down");
        });

        it("renders the plus key (named token or glyph) as '+'", () => {
            expect(formatShortcutKey("Plus")).toBe("+");
            expect(formatShortcutKey("+")).toBe("+");
        });

        it("passes non-table tokens through verbatim (letters, digits, function keys, punctuation)", () => {
            expect(formatShortcutKey("J")).toBe("J");
            expect(formatShortcutKey("5")).toBe("5");
            expect(formatShortcutKey("F11")).toBe("F11");
            expect(formatShortcutKey("[")).toBe("[");
            expect(formatShortcutKey("=")).toBe("=");
        });

        it("uses the translator for known tokens and ignores it for pass-through tokens", () => {
            expect(formatShortcutKey("Ctrl", fakeTranslate)).toBe("L·CTRL");
            expect(formatShortcutKey("ArrowLeft", fakeTranslate)).toBe("L·LEFT");
            // Letters have no id, so the translator is never consulted.
            expect(formatShortcutKey("J", fakeTranslate)).toBe("J");
        });

        it("falls back to the English default when the translator returns a nullish value", () => {
            const emptyTranslate: ShortcutKeyTranslator = () => undefined;
            const blankTranslate: ShortcutKeyTranslator = () => "";
            expect(formatShortcutKey("Shift", emptyTranslate)).toBe("Shift");
            expect(formatShortcutKey("Shift", blankTranslate)).toBe("Shift");
        });
    });

    describe("formatShortcut", () => {
        it("produces an ordered list of English labels by default", () => {
            expect(formatShortcut("Ctrl+Shift+J")).toEqual([ "Ctrl", "Shift", "J" ]);
            expect(formatShortcut("Alt+Left")).toEqual([ "Alt", "Left" ]);
            expect(formatShortcut("Meta+Plus")).toEqual([ "Meta", "+" ]);
            expect(formatShortcut("F5")).toEqual([ "F5" ]);
        });

        it("translates every table token while leaving pass-through tokens intact", () => {
            expect(formatShortcut("Ctrl+Shift+Up", fakeTranslate)).toEqual([ "L·CTRL", "L·SHIFT", "L·UP" ]);
            expect(formatShortcut("Ctrl+J", fakeTranslate)).toEqual([ "L·CTRL", "J" ]);
        });

        it("strips global: and normalizes aliases end-to-end", () => {
            expect(formatShortcut("global:CommandOrControl+Alt+P")).toEqual([ "Ctrl", "Alt", "P" ]);
            expect(formatShortcut("Cmd+ArrowRight")).toEqual([ "Meta", "Right" ]);
        });

        it("returns [] for an empty shortcut", () => {
            expect(formatShortcut("")).toEqual([]);
        });
    });

    it("exposes the i18n key prefix for the integration layer", () => {
        expect(SHORTCUT_KEY_PREFIX).toBe("keyboard_shortcut_keys");
    });
});
