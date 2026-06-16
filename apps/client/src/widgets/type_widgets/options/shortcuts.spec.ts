import { describe, expect, it } from "vitest";

import { keyboardEventToShortcut } from "./shortcuts";

function keyEvent(init: KeyboardEventInit) {
    return new KeyboardEvent("keydown", init);
}

describe("keyboardEventToShortcut", () => {
    it("combines modifiers with the pressed key", () => {
        expect(keyboardEventToShortcut(keyEvent({ key: "j", code: "KeyJ", ctrlKey: true }))).toBe("Ctrl+J");
        expect(keyboardEventToShortcut(keyEvent({ key: "J", code: "KeyJ", ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+J");
    });

    it("always orders modifiers as Ctrl, Alt, Shift, Meta", () => {
        const shortcut = keyboardEventToShortcut(keyEvent({
            key: "k", code: "KeyK", ctrlKey: true, altKey: true, shiftKey: true, metaKey: true
        }));

        expect(shortcut).toBe("Ctrl+Alt+Shift+Meta+K");
    });

    it("uses the physical key code so the result is keyboard-layout independent", () => {
        // On macOS, Alt produces a special character in `key`, but `code` stays stable.
        expect(keyboardEventToShortcut(keyEvent({ key: "√", code: "KeyV", altKey: true }))).toBe("Alt+V");
        expect(keyboardEventToShortcut(keyEvent({ key: "1", code: "Digit1", ctrlKey: true }))).toBe("Ctrl+1");
        expect(keyboardEventToShortcut(keyEvent({ key: "1", code: "Numpad1", ctrlKey: true }))).toBe("Ctrl+1");
    });

    it("maps arrow and space keys to the stored names", () => {
        expect(keyboardEventToShortcut(keyEvent({ key: "ArrowLeft", code: "ArrowLeft", altKey: true }))).toBe("Alt+Left");
        expect(keyboardEventToShortcut(keyEvent({ key: "ArrowUp", code: "ArrowUp", ctrlKey: true }))).toBe("Ctrl+Up");
        expect(keyboardEventToShortcut(keyEvent({ key: " ", code: "Space", ctrlKey: true }))).toBe("Ctrl+Space");
    });

    it("returns null for a lone modifier key", () => {
        expect(keyboardEventToShortcut(keyEvent({ key: "Shift", code: "ShiftLeft", shiftKey: true }))).toBeNull();
        expect(keyboardEventToShortcut(keyEvent({ key: "Control", code: "ControlLeft", ctrlKey: true }))).toBeNull();
        expect(keyboardEventToShortcut(keyEvent({ key: "Meta", code: "MetaLeft", metaKey: true }))).toBeNull();
    });

    describe("single-key shortcuts", () => {
        it("rejects a modifier-less ordinary key", () => {
            expect(keyboardEventToShortcut(keyEvent({ key: "a", code: "KeyA" }))).toBeNull();
            expect(keyboardEventToShortcut(keyEvent({ key: "1", code: "Digit1" }))).toBeNull();
            expect(keyboardEventToShortcut(keyEvent({ key: "Escape", code: "Escape" }))).toBeNull();
        });

        it("allows modifier-less function keys, Delete and Enter", () => {
            expect(keyboardEventToShortcut(keyEvent({ key: "F5", code: "F5" }))).toBe("F5");
            expect(keyboardEventToShortcut(keyEvent({ key: "F11", code: "F11" }))).toBe("F11");
            expect(keyboardEventToShortcut(keyEvent({ key: "Delete", code: "Delete" }))).toBe("Delete");
            expect(keyboardEventToShortcut(keyEvent({ key: "Enter", code: "Enter" }))).toBe("Enter");
            expect(keyboardEventToShortcut(keyEvent({ key: "Enter", code: "NumpadEnter" }))).toBe("Enter");
        });

        it("allows a single key once a modifier is held", () => {
            expect(keyboardEventToShortcut(keyEvent({ key: "a", code: "KeyA", shiftKey: true }))).toBe("Shift+A");
        });
    });
});
