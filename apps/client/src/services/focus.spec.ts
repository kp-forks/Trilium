import { afterEach, describe, expect, it, vi } from "vitest";
import $ from "jquery";

import { focusSavedElement, saveFocusedElement } from "./focus.js";

afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
});

describe("focus service", () => {
    it("does nothing when no element was saved", () => {
        // Nothing focused -> $(":focus") is empty, so the saved element is falsy and focusSavedElement returns early.
        saveFocusedElement();
        expect(() => focusSavedElement()).not.toThrow();
    });

    it("restores focus to a plain saved element", () => {
        const $input = $("<input type='text'>").appendTo(document.body);
        const el = $input[0] as HTMLInputElement;
        el.focus();
        expect(document.activeElement).toBe(el);

        saveFocusedElement();

        // Move focus elsewhere, then restore it.
        const $other = $("<input type='text'>").appendTo(document.body);
        ($other[0] as HTMLInputElement).focus();
        expect(document.activeElement).toBe($other[0]);

        focusSavedElement();
        expect(document.activeElement).toBe(el);

        // After restoring, the saved element is cleared -> calling again is a no-op.
        ($other[0] as HTMLInputElement).focus();
        focusSavedElement();
        expect(document.activeElement).toBe($other[0]);
    });

    it("focuses the CKEditor instance when the saved element is a ck element", () => {
        const focusSpy = vi.fn();
        const editorInstance = { editing: { view: { focus: focusSpy } } };

        const $editable = $("<div class='ck-editor__editable'>").appendTo(document.body);
        // jQuery .prop() reads from the DOM property bag.
        $editable.prop("ckeditorInstance", editorInstance);
        // The focused element carries the "ck" class and lives inside the editable.
        const $ck = $("<div class='ck' tabindex='0'>").appendTo($editable);
        ($ck[0] as HTMLElement).focus();

        saveFocusedElement();
        focusSavedElement();

        expect(focusSpy).toHaveBeenCalledTimes(1);
    });

    it("logs when the ck element has no resolvable CKEditor instance", () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

        // A ck element with no .ck-editor__editable ancestor -> editor lookup yields undefined.
        const $ck = $("<div class='ck' tabindex='0'>").appendTo(document.body);
        ($ck[0] as HTMLElement).focus();

        saveFocusedElement();
        focusSavedElement();

        expect(logSpy).toHaveBeenCalledWith("Could not find CKEditor instance to focus last element");
    });
});
