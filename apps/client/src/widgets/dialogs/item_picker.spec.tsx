import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Component from "../../components/component";
import { ParentComponent } from "../react/react_utils";
import ItemPickerDialog, { type ItemPickerDialogOptions, type PickerItem } from "./item_picker";

// i18next is never initialised under test, so the stock title and placeholder would be undefined.
vi.mock("../../services/i18n", () => ({
    t: (key: string) => key
}));

const GROUPS = [
    {
        key: "fruit",
        groupHeader: "Fruit",
        items: [
            { key: "apple", caption: "Apple", icon: "bx bx-leaf" },
            { key: "apricot", caption: "Apricot" }
        ]
    },
    {
        key: "tools",
        groupHeader: "Tools",
        items: [
            { key: "hammer", caption: "Hammer" },
            { key: "plane", caption: "Plane" }
        ]
    }
];

describe("ItemPickerDialog", () => {
    let container: HTMLElement;
    let host: Component;
    let picked: (PickerItem | null)[];

    beforeEach(() => {
        vi.useFakeTimers();
        picked = [];
        container = document.createElement("div");
        document.body.appendChild(container);
        host = new Component();

        act(() => {
            render(
                <ParentComponent.Provider value={host}>
                    <ItemPickerDialog />
                </ParentComponent.Provider>,
                container);
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        render(null, container);
        container.remove();
    });

    it("draws a card for each group, with an item for each of its entries", async () => {
        await open({ title: "Pick one", items: GROUPS });

        expect(headings()).toEqual([ "Fruit", "Tools" ]);
        expect(captions()).toEqual([ "Apple", "Apricot", "Hammer", "Plane" ]);
        expect(dialog()?.querySelector(".modal-title")?.textContent).toContain("Pick one");
        // The icon an entry carries, for the entries that carry one.
        expect(item("Apple")?.querySelector(".bx-leaf")).not.toBeNull();
    });

    /** A plain list is one group with nothing written above it. */
    it("takes a list of items as readily as groups of them", async () => {
        await open({ items: [ { key: "one", caption: "One" }, { key: "two", caption: "Two" } ] });

        expect(captions()).toEqual([ "One", "Two" ]);
        expect(headings()).toEqual([]);
    });

    it("answers with what was picked, and closes", async () => {
        await open({ items: GROUPS });

        await act(async () => { item("Hammer")?.click(); });
        await close();

        expect(picked).toEqual([ GROUPS[1].items[0] ]);
    });

    it("answers with nothing where the reader backed out", async () => {
        await open({ items: GROUPS });
        await close();

        expect(picked).toEqual([ null ]);
    });

    it("picks with the keyboard as well as with a press", async () => {
        await open({ items: GROUPS });

        await act(async () => {
            item("Plane")?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        });
        await close();

        expect(picked).toEqual([ GROUPS[1].items[1] ]);
    });

    describe("searching", () => {
        /**
         * Folded away rather than taken down, so the list closes over what was filtered out. What
         * is left standing is what a press can still reach.
         */
        it("folds away everything that does not match", async () => {
            await open({ items: GROUPS });

            await type("app");

            expect(standing()).toEqual([ "Apple" ]);
            expect(item("Hammer")?.className).toContain("item-picker-folded");
            // Still drawn, so the folding can be drawn as well.
            expect(captions()).toEqual([ "Apple", "Apricot", "Hammer", "Plane" ]);
        });

        it("marks what was typed wherever it stands in the caption", async () => {
            await open({ items: GROUPS });

            await type("mm");

            const marked = item("Hammer")?.querySelectorAll("mark");
            expect([ ...marked ?? [] ].map((mark) => mark.textContent)).toEqual([ "mm" ]);
            // What was not typed is left as it was.
            expect(item("Hammer")?.textContent).toBe("Hammer");
        });

        it("shows a whole group asked for by its own name", async () => {
            await open({ items: GROUPS });

            await type("tools");

            expect(standing()).toEqual([ "Hammer", "Plane" ]);
        });

        it("leaves everything standing once the field is emptied again", async () => {
            await open({ items: GROUPS });

            await type("app");
            expect(standing()).toEqual([ "Apple" ]);

            await type("");
            expect(standing()).toEqual([ "Apple", "Apricot", "Hammer", "Plane" ]);
            expect(item("Apple")?.querySelectorAll("mark").length).toBe(0);
        });

        /** The field the settings are looked through, clear button and all. */
        it("is searched through the app's own search field", async () => {
            await open({ items: GROUPS });

            expect(dialog()?.querySelector(".settings-search-icon")).not.toBeNull();
            expect(dialog()?.querySelector(".settings-search-clear")).toBeNull();

            await type("app");
            expect(standing()).toEqual([ "Apple" ]);

            const clear = dialog()?.querySelector<HTMLElement>(".settings-search-clear");
            expect(clear).not.toBeNull();
            await act(async () => { clear?.click(); await Promise.resolve(); });
            await act(async () => { vi.advanceTimersByTime(300); await Promise.resolve(); });

            expect(standing()).toEqual([ "Apple", "Apricot", "Hammer", "Plane" ]);
        });

        /**
         * Nothing left standing is what shows the placeholder, which is laid over the list rather
         * than following it: whether it is painted is CSS's to say from the same condition.
         */
        it("leaves nothing standing when nothing matches at all", async () => {
            await open({ items: GROUPS });

            await type("zzz");

            expect(standing()).toEqual([]);
            const empty = dialog()?.querySelector(".item-picker-empty");
            expect(empty?.previousElementSibling?.className).toContain("item-picker-groups");
        });
    });

    // #region The dialog, and what the test does to it

    async function open(options: Omit<ItemPickerDialogOptions, "callback">) {
        await act(async () => {
            await host.handleEvent("showItemPickerDialog", {
                ...options,
                callback: (item: PickerItem | null) => picked.push(item)
            } as never);
            await Promise.resolve();
        });
    }

    /** Bootstrap tells the dialog it has gone; under test the event is the test's to send. */
    async function close() {
        await act(async () => {
            dialog()?.dispatchEvent(new Event("hidden.bs.modal", { bubbles: true }));
            await Promise.resolve();
        });
    }

    async function type(query: string) {
        const field = dialog()?.querySelector<HTMLInputElement>(".settings-search-input");
        await act(async () => {
            if (field) {
                field.value = query;
                field.dispatchEvent(new Event("input", { bubbles: true }));
            }
            await Promise.resolve();
        });

        // The typing settles before the list answers it.
        await act(async () => { vi.advanceTimersByTime(300); await Promise.resolve(); });
    }

    function dialog() {
        return document.querySelector<HTMLElement>(".modal.item-picker-dialog");
    }

    function items() {
        return [ ...(dialog()?.querySelectorAll<HTMLElement>(".item-picker-item") ?? []) ];
    }

    function captions() {
        return items().map((element) => element.textContent);
    }

    /** What is left standing, which is what the reader can still pick. */
    function standing() {
        return items()
            .filter((element) => !element.className.includes("item-picker-folded"))
            .map((element) => element.textContent);
    }

    function item(caption: string) {
        return items().find((element) => element.textContent === caption);
    }

    function headings() {
        return [ ...(dialog()?.querySelectorAll(".tn-card-heading") ?? []) ]
            .map((element) => element.textContent);
    }

    // #endregion
});
