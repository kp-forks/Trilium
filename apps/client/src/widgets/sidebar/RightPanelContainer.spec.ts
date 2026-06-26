import { afterEach, describe, expect, it } from "vitest";

import { isWithinOverlay } from "./RightPanelContainer";

describe("isWithinOverlay", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    function mount(html: string) {
        document.body.innerHTML = html;
    }

    it("keeps the overlay open for the pane, the handle, and allowlisted popups", () => {
        mount(`
            <div id="right-pane"><span class="toc-item">x</span></div>
            <button class="right-pane-toggle-handle"></button>
            <ul class="dropdown-menu"><li class="dropdown-item">y</li></ul>
            <div class="tooltip">t</div>
        `);

        for (const selector of [".toc-item", ".right-pane-toggle-handle", ".dropdown-item", ".tooltip"]) {
            expect(isWithinOverlay(document.querySelector(selector)), selector).toBe(true);
        }
    });

    it("dismisses for the backdrop, surrounding chrome, and non-elements", () => {
        mount(`
            <div class="right-pane-overlay-backdrop active"></div>
            <div id="center-pane"><p class="editor">z</p></div>
            <div class="tab-row-container"><span class="tab">t</span></div>
            <div id="left-pane"><span class="tree-item">n</span></div>
        `);

        // The backdrop is deliberately outside the allowlist, so clicking the covered content dismisses.
        for (const selector of [".right-pane-overlay-backdrop", ".editor", ".tab", ".tree-item"]) {
            expect(isWithinOverlay(document.querySelector(selector)), selector).toBe(false);
        }
        expect(isWithinOverlay(document.body)).toBe(false);
        expect(isWithinOverlay(null)).toBe(false);
        expect(isWithinOverlay(document)).toBe(false);
    });
});
