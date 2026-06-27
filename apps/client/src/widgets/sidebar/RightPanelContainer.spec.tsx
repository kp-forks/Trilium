import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isWithinOverlay, persistedRightPaneVisible, reduceRightPaneMode, useOverlayDismiss } from "./RightPanelContainer";

describe("reduceRightPaneMode", () => {
    it("opens as overlay from closed and closes otherwise", () => {
        expect(reduceRightPaneMode("closed", "toggleOverlay")).toBe("overlay");
        expect(reduceRightPaneMode("overlay", "toggleOverlay")).toBe("closed");
        expect(reduceRightPaneMode("docked", "toggleOverlay")).toBe("closed");
    });

    it("opens as docked from closed and closes otherwise", () => {
        expect(reduceRightPaneMode("closed", "toggleDocked")).toBe("docked");
        expect(reduceRightPaneMode("overlay", "toggleDocked")).toBe("closed");
        expect(reduceRightPaneMode("docked", "toggleDocked")).toBe("closed");
    });

    it("docks and closes unconditionally", () => {
        for (const prev of ["closed", "overlay", "docked"] as const) {
            expect(reduceRightPaneMode(prev, "dock")).toBe("docked");
            expect(reduceRightPaneMode(prev, "close")).toBe("closed");
        }
    });
});

describe("persistedRightPaneVisible", () => {
    it("persists only when the docked/closed distinction changes", () => {
        // No docked-ness change -> no write (overlay is ephemeral).
        expect(persistedRightPaneVisible("closed", "overlay")).toBe(null);
        expect(persistedRightPaneVisible("overlay", "closed")).toBe(null);
        // Becoming docked persists true; leaving docked persists false.
        expect(persistedRightPaneVisible("closed", "docked")).toBe(true);
        expect(persistedRightPaneVisible("overlay", "docked")).toBe(true);
        expect(persistedRightPaneVisible("docked", "closed")).toBe(false);
        expect(persistedRightPaneVisible("docked", "overlay")).toBe(false);
    });
});

describe("isWithinOverlay", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("keeps the overlay open for the pane, the handle, and allowlisted popups", () => {
        document.body.innerHTML = `
            <div id="right-pane"><span class="toc-item">x</span></div>
            <button class="right-pane-toggle-handle"></button>
            <ul class="dropdown-menu"><li class="dropdown-item">y</li></ul>
            <div class="tooltip">t</div>
        `;
        for (const selector of [".toc-item", ".right-pane-toggle-handle", ".dropdown-item", ".tooltip"]) {
            expect(isWithinOverlay(document.querySelector(selector)), selector).toBe(true);
        }
    });

    it("dismisses for the backdrop, surrounding chrome, and non-elements", () => {
        document.body.innerHTML = `
            <div class="right-pane-overlay-backdrop active"></div>
            <div id="center-pane"><p class="editor">z</p></div>
            <div class="tab-row-container"><span class="tab">t</span></div>
            <div id="left-pane"><span class="tree-item">n</span></div>
        `;
        // The backdrop is deliberately outside the allowlist, so clicking the covered content dismisses.
        for (const selector of [".right-pane-overlay-backdrop", ".editor", ".tab", ".tree-item"]) {
            expect(isWithinOverlay(document.querySelector(selector)), selector).toBe(false);
        }
        expect(isWithinOverlay(document.body)).toBe(false);
        expect(isWithinOverlay(null)).toBe(false);
        expect(isWithinOverlay(document)).toBe(false);
    });
});

describe("useOverlayDismiss", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    function renderHook(active: boolean, onDismiss: () => void) {
        const host = document.createElement("div");
        document.body.appendChild(host);
        function Harness() {
            useOverlayDismiss(active, onDismiss);
            return null;
        }
        // act() flushes the effect so the document listeners are attached before we dispatch.
        act(() => render(<Harness />, host));
        return () => act(() => render(null, host)); // unmount
    }

    it("dismisses on an outside press but not on a press within the overlay", () => {
        document.body.innerHTML = `<div id="right-pane"></div><div id="center-pane"></div>`;
        const onDismiss = vi.fn();
        const unmount = renderHook(true, onDismiss);

        document.querySelector("#right-pane")?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        expect(onDismiss).not.toHaveBeenCalled();

        document.querySelector("#center-pane")?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        expect(onDismiss).toHaveBeenCalledTimes(1);

        unmount();
    });

    it("dismisses on Escape, and does nothing while inactive", () => {
        const onDismiss = vi.fn();

        const unmountInactive = renderHook(false, onDismiss);
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        document.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        expect(onDismiss).not.toHaveBeenCalled();
        unmountInactive();

        const unmountActive = renderHook(true, onDismiss);
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(onDismiss).toHaveBeenCalledTimes(1);
        unmountActive();
    });
});
