import { Tooltip } from "bootstrap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditorTooltipManager, type TooltipHandle } from "./editor_tooltip_manager.js";

/**
 * The visible `.tooltip` popup that Bootstrap adds to the body when a tooltip
 * is shown. Returns null when nothing is on screen. Used as the ground-truth
 * for "is the manager currently rendering something".
 */
function livePopup(): HTMLElement | null {
    return document.body.querySelector<HTMLElement>(".tooltip");
}

/** Text content of the currently-rendered popup, stripped of surrounding whitespace. */
function livePopupText(): string | null {
    return livePopup()?.textContent?.trim() ?? null;
}

describe("EditorTooltipManager", () => {
    let host: HTMLDivElement;
    let a: HTMLButtonElement;
    let b: HTMLButtonElement;
    let manager: EditorTooltipManager;

    beforeEach(() => {
        host = document.createElement("div");
        a = document.createElement("button");
        a.textContent = "A";
        b = document.createElement("button");
        b.textContent = "B";
        host.appendChild(a);
        host.appendChild(b);
        document.body.appendChild(host);
        manager = new EditorTooltipManager();
    });

    afterEach(() => {
        manager.destroy();
        host.remove();
        // Belt-and-braces: strip any orphaned Bootstrap popups left over.
        document.body.querySelectorAll(".tooltip").forEach(el => el.remove());
    });

    describe("show / hide", () => {
        it("renders a Bootstrap tooltip on the element when a handle is shown", () => {
            const handle = manager.createHandle(a, "hello");
            expect(livePopup()).toBeNull();
            handle.show();
            expect(livePopupText()).toBe("hello");
        });

        it("removes the popup when the only shown handle is hidden", () => {
            const handle = manager.createHandle(a, "hello");
            handle.show();
            handle.hide();
            expect(livePopup()).toBeNull();
        });

        it("removing a non-top handle leaves the visible tooltip untouched", () => {
            const top = manager.createHandle(a, "top");
            const bottom = manager.createHandle(a, "bottom");
            bottom.show();
            top.show();
            expect(livePopupText()).toBe("top");
            bottom.hide(); // not on top → no visual change
            expect(livePopupText()).toBe("top");
        });

        it("popping the top reveals the handle immediately below it", () => {
            const bottom = manager.createHandle(a, "bottom");
            const top = manager.createHandle(a, "top");
            bottom.show();
            top.show();
            expect(livePopupText()).toBe("top");
            top.hide();
            expect(livePopupText()).toBe("bottom");
        });

        it("switches element when the top-of-stack handle is on a different element", () => {
            const handleA = manager.createHandle(a, "A tip");
            const handleB = manager.createHandle(b, "B tip");
            handleA.show();
            expect(livePopupText()).toBe("A tip");
            handleB.show();
            expect(livePopupText()).toBe("B tip");
            handleB.hide();
            expect(livePopupText()).toBe("A tip");
        });

        it("show() on a handle already in the stack moves it to the top", () => {
            const first = manager.createHandle(a, "A");
            const second = manager.createHandle(b, "B");
            first.show();
            second.show();
            expect(livePopupText()).toBe("B");
            first.show(); // re-show → moves to top
            expect(livePopupText()).toBe("A");
        });

        it("show() no-ops when the element is detached", () => {
            const handle = manager.createHandle(a, "hello");
            host.remove();
            handle.show();
            expect(livePopup()).toBeNull();
        });
    });

    describe("showAfter (dwell delay)", () => {
        beforeEach(() => vi.useFakeTimers());
        afterEach(() => vi.useRealTimers());

        it("shows the tooltip after the specified delay", () => {
            const handle = manager.createHandle(a, "hello");
            handle.showAfter(1000);
            expect(livePopup()).toBeNull();
            vi.advanceTimersByTime(999);
            expect(livePopup()).toBeNull();
            vi.advanceTimersByTime(1);
            expect(livePopupText()).toBe("hello");
        });

        it("hide() before the timer fires cancels the pending show", () => {
            const handle = manager.createHandle(a, "hello");
            handle.showAfter(1000);
            vi.advanceTimersByTime(500);
            handle.hide();
            vi.advanceTimersByTime(600);
            expect(livePopup()).toBeNull();
        });

        it("show() before the timer fires cancels the pending and shows immediately", () => {
            const handle = manager.createHandle(a, "hello");
            handle.showAfter(1000);
            handle.show();
            expect(livePopupText()).toBe("hello");
        });

        it("a second showAfter() resets the timer", () => {
            const handle = manager.createHandle(a, "hello");
            handle.showAfter(1000);
            vi.advanceTimersByTime(999);
            handle.showAfter(1000); // reset
            vi.advanceTimersByTime(999);
            expect(livePopup()).toBeNull();
            vi.advanceTimersByTime(1);
            expect(livePopupText()).toBe("hello");
        });

        it("dispose() cancels any pending showAfter", () => {
            const handle = manager.createHandle(a, "hello");
            handle.showAfter(1000);
            handle.dispose();
            vi.advanceTimersByTime(2000);
            expect(livePopup()).toBeNull();
        });
    });

    describe("setContent", () => {
        it("updates the visible tooltip when the handle is on top", () => {
            const handle = manager.createHandle(a, "before");
            handle.show();
            handle.setContent("after");
            expect(livePopupText()).toBe("after");
        });

        it("updates the pending content when the handle is not currently shown", () => {
            const handle = manager.createHandle(a, "initial");
            handle.setContent("updated");
            handle.show();
            expect(livePopupText()).toBe("updated");
        });
    });

    describe("dispose", () => {
        it("removes the handle from the stack", () => {
            const bottom = manager.createHandle(a, "bottom");
            const top = manager.createHandle(a, "top");
            bottom.show();
            top.show();
            expect(livePopupText()).toBe("top");
            top.dispose();
            expect(livePopupText()).toBe("bottom");
        });

        it("is idempotent", () => {
            const handle = manager.createHandle(a, "hello");
            handle.show();
            handle.dispose();
            expect(() => handle.dispose()).not.toThrow();
        });
    });

    describe("destroy", () => {
        it("hides any currently-rendered tooltip", () => {
            const handle = manager.createHandle(a, "hello");
            handle.show();
            manager.destroy();
            expect(livePopup()).toBeNull();
        });

        it("makes handles inert (subsequent show is a no-op)", () => {
            const handle = manager.createHandle(a, "hello");
            manager.destroy();
            handle.show();
            expect(livePopup()).toBeNull();
        });
    });

    describe("tooltip options", () => {
        it("applies the base options to every popup", () => {
            const scoped = new EditorTooltipManager({
                tooltipOptions: { customClass: "test-scope" }
            });
            const handle = scoped.createHandle(a, "hello");
            handle.show();
            expect(livePopup()?.classList.contains("test-scope")).toBe(true);
            scoped.destroy();
        });

        it("uses `manual` trigger regardless of what the caller passes", () => {
            const scoped = new EditorTooltipManager({
                tooltipOptions: { trigger: "hover" as Tooltip.Options["trigger"] }
            });
            const handle = scoped.createHandle(a, "hello");
            handle.show();
            const instance = Tooltip.getInstance(a);
            const config = (instance as unknown as { _config: { trigger: string } } | null)?._config;
            expect(config?.trigger).toBe("manual");
            scoped.destroy();
        });
    });

    describe("detached elements", () => {
        it("silently drops entries whose element is no longer in the DOM", () => {
            const handle = manager.createHandle(a, "hello");
            handle.show();
            a.remove(); // element detaches while its tooltip is up
            // A subsequent show anywhere triggers _render, which sweeps dead entries.
            const other = manager.createHandle(b, "other");
            other.show();
            expect(livePopupText()).toBe("other");
        });
    });

    describe("handle usage patterns", () => {
        it("supports independent hover + caret handles on the same element without flicker", () => {
            // Simulate the multistate plugin's hover + caret pair on one checkbox.
            const hover: TooltipHandle = manager.createHandle(a, "content");
            const caret: TooltipHandle = manager.createHandle(a, "content");

            caret.show();
            expect(livePopupText()).toBe("content");

            // Mouse hovers the checkbox — hover pushes; both are on stack, same element,
            // so `_render` just refreshes content in place.
            hover.show();
            expect(livePopupText()).toBe("content");

            // Mouse leaves — hover pops. Same element still on top; still shown.
            hover.hide();
            expect(livePopupText()).toBe("content");
        });
    });
});
