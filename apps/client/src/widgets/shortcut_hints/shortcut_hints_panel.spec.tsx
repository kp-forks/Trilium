import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/i18n.js", () => ({ t: (key: string) => key }));
vi.mock("../../services/keyboard_actions.js", () => ({
    default: { getAction: vi.fn().mockResolvedValue({ effectiveShortcuts: ["Ctrl+K"], friendlyName: "Jump to note" }) }
}));

import Component from "../../components/component.js";
import type { ShortcutHintSection } from "../../services/shortcut_hints.js";
import { ParentComponent } from "../react/react_utils.js";
import ShortcutHintsPanel, { ShortcutHintsSections } from "./shortcut_hints_panel.js";

let container: HTMLDivElement;

afterEach(() => {
    act(() => render(null, container));
    container.remove();
});

function mount(vnode: preact.ComponentChild) {
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => render(vnode, container));
    return container;
}

function mountPanel() {
    const host = new Component();
    mount(<ParentComponent.Provider value={host}><ShortcutHintsPanel /></ParentComponent.Provider>);
    return host;
}

const SECTIONS: ShortcutHintSection[] = [{ hints: [{ keys: ["A"], labelKey: "act.a" }] }];

describe("ShortcutHintsSections", () => {
    it("renders a section title, literal keys and the description", () => {
        mount(<ShortcutHintsSections sections={[
            { titleKey: "grp.nav", hints: [{ keys: ["Page Down", "Ctrl+>"], labelKey: "act.next" }] }
        ]} />);

        expect(container.querySelector(".shortcut-hints-section-title")?.textContent).toBe("grp.nav");
        expect(container.querySelector(".shortcut-hint-description")?.textContent).toBe("act.next");
        expect(container.querySelectorAll(".shortcut-hint-keys kbd").length).toBeGreaterThan(0);
    });

    it("resolves an action hint's keys and falls back to its friendly name", async () => {
        mount(<ShortcutHintsSections sections={[{ hints: [{ action: "jumpToNote" }] }]} />);
        await act(async () => { await Promise.resolve(); });

        expect(container.querySelector(".shortcut-hint-description")?.textContent).toBe("Jump to note");
        expect(container.querySelectorAll(".shortcut-hint-keys kbd").length).toBeGreaterThan(0);
    });
});

describe("ShortcutHintsPanel", () => {
    it("stays closed until summoned, opens on the event, and toggles closed on the next", () => {
        const host = mountPanel();
        expect(container.querySelector(".shortcut-hints-panel")).toBeNull();

        act(() => host.handleEvent("shortcutHintsRequested", { sections: SECTIONS }));
        expect(container.querySelector(".shortcut-hints-panel")).not.toBeNull();

        act(() => host.handleEvent("shortcutHintsRequested", { sections: SECTIONS }));
        expect(container.querySelector(".shortcut-hints-panel")).toBeNull();
    });

    it("does not open when there are no sections", () => {
        const host = mountPanel();
        act(() => host.handleEvent("shortcutHintsRequested", { sections: [] }));
        expect(container.querySelector(".shortcut-hints-panel")).toBeNull();
    });

    it("closes on Escape", () => {
        const host = mountPanel();
        act(() => host.handleEvent("shortcutHintsRequested", { sections: SECTIONS }));
        expect(container.querySelector(".shortcut-hints-panel")).not.toBeNull();

        act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
        expect(container.querySelector(".shortcut-hints-panel")).toBeNull();
    });

    it("auto-dismisses after the timeout", () => {
        vi.useFakeTimers();
        try {
            const host = mountPanel();
            act(() => host.handleEvent("shortcutHintsRequested", { sections: SECTIONS }));
            expect(container.querySelector(".shortcut-hints-panel")).not.toBeNull();

            act(() => vi.advanceTimersByTime(5000));
            expect(container.querySelector(".shortcut-hints-panel")).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it("closes when the active note context changes", () => {
        const host = mountPanel();
        act(() => host.handleEvent("shortcutHintsRequested", { sections: SECTIONS }));
        expect(container.querySelector(".shortcut-hints-panel")).not.toBeNull();

        act(() => host.handleEvent("activeContextChanged", { noteContext: {} }));
        expect(container.querySelector(".shortcut-hints-panel")).toBeNull();
    });
});
