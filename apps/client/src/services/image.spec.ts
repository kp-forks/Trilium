import $ from "jquery";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import imageService, { copyImageReferenceToClipboard } from "./image.js";
import toastService from "./toast.js";

describe("copyImageReferenceToClipboard", () => {
    let execCommandSpy: ReturnType<typeof vi.fn>;
    let removeAllRangesSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        // image.ts calls the bare global `logError`, normally installed by ws.ts (which setup.ts mocks).
        (window as any).logError = vi.fn();

        // happy-dom does not implement execCommand; provide a controllable stub.
        execCommandSpy = vi.fn(() => true);
        (document as any).execCommand = execCommandSpy;

        // Track range clean-up performed in the finally block.
        removeAllRangesSpy = vi.fn();
        const selection = {
            removeAllRanges: removeAllRangesSpy,
            addRange: vi.fn()
        };
        vi.spyOn(window, "getSelection").mockReturnValue(selection as unknown as Selection);

        vi.spyOn(toastService, "showMessage").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("selects the image, copies it and shows a success message, then cleans up", () => {
        const element = document.createElement("div");
        document.body.appendChild(element);
        const $wrapper = $(element);

        copyImageReferenceToClipboard($wrapper);

        // contenteditable is toggled on then removed in the finally block.
        expect($wrapper.attr("contenteditable")).toBeUndefined();
        expect(execCommandSpy).toHaveBeenCalledWith("copy");
        expect(toastService.showMessage).toHaveBeenCalledTimes(1);
        // Selection was created on the element (selectImage took the happy path) and cleaned up.
        expect(removeAllRangesSpy).toHaveBeenCalled();

        element.remove();
    });

    it("reports an error when the copy command fails", () => {
        execCommandSpy.mockReturnValue(false);
        const $wrapper = $(document.createElement("div"));

        copyImageReferenceToClipboard($wrapper);

        expect(toastService.showMessage).not.toHaveBeenCalled();
        expect((window as any).logError).toHaveBeenCalledTimes(1);
        expect($wrapper.attr("contenteditable")).toBeUndefined();
    });

    it("does nothing in selectImage when the wrapper has no element", () => {
        const addRange = vi.fn();
        (window.getSelection as any).mockReturnValue({
            removeAllRanges: removeAllRangesSpy,
            addRange
        });

        // An empty jQuery wrapper -> .get(0) is undefined -> selectImage early-returns.
        const $empty = $([] as unknown as HTMLElement);

        copyImageReferenceToClipboard($empty);

        expect(addRange).not.toHaveBeenCalled();
        expect(execCommandSpy).toHaveBeenCalledWith("copy");
    });

    it("exposes copyImageReferenceToClipboard on the default export", () => {
        expect(imageService.copyImageReferenceToClipboard).toBe(copyImageReferenceToClipboard);
    });
});
