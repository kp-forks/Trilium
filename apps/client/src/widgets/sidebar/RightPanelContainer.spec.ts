import { afterEach, describe, expect, it } from "vitest";

import { isWithinOverlay } from "./RightPanelContainer";

describe("isWithinOverlay", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    function mount(html: string) {
        document.body.innerHTML = html;
    }

    it("treats the pane, the handle, and allowlisted popups as inside", () => {
        mount(`
            <div id="right-pane"><span class="toc-item">x</span></div>
            <button class="right-pane-toggle-handle"></button>
            <ul class="dropdown-menu"><li class="dropdown-item">y</li></ul>
            <div class="tooltip">t</div>
            <div id="center-pane"><p class="editor">z</p></div>
        `);

        const inside = [".toc-item", ".right-pane-toggle-handle", ".dropdown-item", ".tooltip"];
        for (const selector of inside) {
            expect(isWithinOverlay(document.querySelector(selector)), selector).toBe(true);
        }
    });

    it("treats content outside the pane/popups as outside, and ignores non-elements", () => {
        mount(`<div id="center-pane"><p class="editor">z</p></div>`);

        expect(isWithinOverlay(document.querySelector(".editor"))).toBe(false);
        expect(isWithinOverlay(document.body)).toBe(false);
        expect(isWithinOverlay(null)).toBe(false);
        expect(isWithinOverlay(document)).toBe(false);
    });

    it("classifies a focused iframe by its location (the PDF-viewer dismiss path)", () => {
        mount(`
            <div id="center-pane"><iframe class="pdf-viewer"></iframe></div>
            <div id="right-pane"><iframe class="sidebar-frame"></iframe></div>
        `);

        // Clicking the PDF viewer (center-pane iframe) should dismiss; a sidebar iframe should not.
        expect(isWithinOverlay(document.querySelector(".pdf-viewer"))).toBe(false);
        expect(isWithinOverlay(document.querySelector(".sidebar-frame"))).toBe(true);
    });
});
