import { ActionKeyboardShortcut, KeyboardShortcut } from "@triliumnext/commons";
import { describe, expect, it } from "vitest";

import { computeConflicts, keyboardEventToShortcut, matchesScopeFilter } from "./shortcuts";

function keyEvent(init: KeyboardEventInit) {
    return new KeyboardEvent("keydown", init);
}

function action(actionName: string, friendlyName: string, effectiveShortcuts: string[]): ActionKeyboardShortcut {
    return { actionName, friendlyName, effectiveShortcuts } as ActionKeyboardShortcut;
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

describe("computeConflicts", () => {
    it("reports no conflicts when every shortcut is unique", () => {
        const conflicts = computeConflicts([
            action("a", "Action A", [ "Ctrl+J" ]),
            action("b", "Action B", [ "Ctrl+K" ])
        ]);

        expect(conflicts.size).toBe(0);
    });

    it("flags both actions sharing a combination, keyed by the original shortcut string", () => {
        const conflicts = computeConflicts([
            action("a", "Action A", [ "Ctrl+J" ]),
            action("b", "Action B", [ "Ctrl+J" ])
        ]);

        expect(conflicts.get("a")?.get("Ctrl+J")).toEqual([ "Action B" ]);
        expect(conflicts.get("b")?.get("Ctrl+J")).toEqual([ "Action A" ]);
    });

    it("detects conflicts across differing modifier order and key aliases", () => {
        const conflicts = computeConflicts([
            action("a", "Action A", [ "Ctrl+Shift+J" ]),
            action("b", "Action B", [ "Shift+Ctrl+J" ]),
            action("c", "Action C", [ "Ctrl+Del" ]),
            action("d", "Action D", [ "Ctrl+Delete" ])
        ]);

        expect(conflicts.get("a")?.get("Ctrl+Shift+J")).toEqual([ "Action B" ]);
        expect(conflicts.get("c")?.get("Ctrl+Del")).toEqual([ "Action D" ]);
    });

    it("treats a global shortcut as conflicting with its in-app equivalent", () => {
        const conflicts = computeConflicts([
            action("a", "Action A", [ "global:Ctrl+J" ]),
            action("b", "Action B", [ "Ctrl+J" ])
        ]);

        expect(conflicts.get("a")?.get("global:Ctrl+J")).toEqual([ "Action B" ]);
        expect(conflicts.get("b")?.get("Ctrl+J")).toEqual([ "Action A" ]);
    });

    it("lists every other action when more than two collide", () => {
        const conflicts = computeConflicts([
            action("a", "Action A", [ "Ctrl+J" ]),
            action("b", "Action B", [ "Ctrl+J" ]),
            action("c", "Action C", [ "Ctrl+J" ])
        ]);

        expect(conflicts.get("a")?.get("Ctrl+J")).toEqual([ "Action B", "Action C" ]);
    });

    it("only marks the conflicting shortcut on an action that also has unique ones", () => {
        const conflicts = computeConflicts([
            action("a", "Action A", [ "Ctrl+J", "Ctrl+K" ]),
            action("b", "Action B", [ "Ctrl+K" ])
        ]);

        const perShortcut = conflicts.get("a");
        expect(perShortcut?.has("Ctrl+J")).toBe(false);
        expect(perShortcut?.get("Ctrl+K")).toEqual([ "Action B" ]);
    });

    it("does not treat an action's own duplicate shortcut as a conflict", () => {
        const conflicts = computeConflicts([
            action("a", "Action A", [ "Ctrl+J", "Ctrl+J" ])
        ]);

        expect(conflicts.size).toBe(0);
    });

    it("ignores separators", () => {
        const conflicts = computeConflicts([
            { separator: "Group" } as KeyboardShortcut,
            action("a", "Action A", [ "Ctrl+J" ]),
            action("b", "Action B", [ "Ctrl+J" ])
        ]);

        expect(conflicts.get("a")?.get("Ctrl+J")).toEqual([ "Action B" ]);
    });
});

describe("matchesScopeFilter", () => {
    const globalAction = action("a", "Action A", [ "global:Ctrl+J" ]);
    const localAction = action("b", "Action B", [ "Ctrl+K" ]);
    const mixedAction = action("c", "Action C", [ "global:Ctrl+J", "Ctrl+K" ]);
    const noShortcuts = action("d", "Action D", []);

    it("matches everything when no scope is selected", () => {
        for (const a of [ globalAction, localAction, mixedAction, noShortcuts ]) {
            expect(matchesScopeFilter(a, null)).toBe(true);
        }
    });

    it("keeps only actions with a global shortcut when filtering by global", () => {
        expect(matchesScopeFilter(globalAction, "global")).toBe(true);
        expect(matchesScopeFilter(mixedAction, "global")).toBe(true);
        expect(matchesScopeFilter(localAction, "global")).toBe(false);
        expect(matchesScopeFilter(noShortcuts, "global")).toBe(false);
    });

    it("keeps only actions with an in-app shortcut when filtering by local", () => {
        expect(matchesScopeFilter(localAction, "local")).toBe(true);
        expect(matchesScopeFilter(mixedAction, "local")).toBe(true);
        expect(matchesScopeFilter(globalAction, "local")).toBe(false);
        expect(matchesScopeFilter(noShortcuts, "local")).toBe(false);
    });
});
