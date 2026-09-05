import { Modal as BootstrapModal } from "bootstrap";
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import dialog from "../../../services/dialog";
import { type NoteTypeOption } from "../../../services/note_types";
import BoardApi from "./api";
import BoardProperties from "./properties";

// i18next is never initialised under test, so every label would read as undefined.
vi.mock("../../../services/i18n", () => ({
    t: (key: string) => key
}));

/** Everything the app could make, as `getNoteTypeOptions` answers with it. */
const AVAILABLE = [
    [ "type:text:text/html", "Text", "type" ],
    [ "type:code:text/x-markdown", "Markdown", "type" ],
    [ "type:canvas:application/json", "Canvas", "type" ],
    [ "template:shipped", "Shipped template", "builtin" ],
    [ "template:mine", "My template", "user" ]
].map(([ id, title, group ]) => ({
    id, title, group, icon: "bx bx-note", options: { type: "text" }
}) as NoteTypeOption);

describe("Board properties", () => {
    let container: HTMLElement;
    let stored: string[][];
    let offered: string[];

    beforeEach(() => {
        stored = [];
        offered = [ "type:text:text/html", "type:code:text/x-markdown" ];
        container = document.createElement("div");
        document.body.appendChild(container);
    });

    afterEach(() => {
        // Taken down before Bootstrap is: what is left of a dialog it still believes is shown holds
        // the focus of everything after it, its teardown waiting on a transition happy-dom never
        // runs.
        render(null, container);
        container.remove();

        const modal = document.querySelector<HTMLElement>(".board-properties-dialog");
        if (modal) {
            BootstrapModal.getInstance(modal)?.dispose();
            modal.remove();
        }

        document.querySelector(".modal-backdrop")?.remove();
        document.body.classList.remove("modal-open");
    });

    it("lists what the board offers, in the order it stores them", () => {
        draw();

        expect(captions()).toEqual([ "Text", "Markdown" ]);
        expect(dialog_()?.querySelector(".tn-card-heading")?.textContent)
            .toContain("board_view.card-templates");
        expect(dialog_()?.querySelector(".tn-card-description")?.textContent)
            .toBe("board_view.card-templates-hint");
    });

    /** The grip leads, so the trailing edge is left to what each entry carries there. */
    it("carries the grip at the start of an entry and the way to remove it at the end", () => {
        draw();
        const [ first ] = segments();

        expect(first.firstElementChild?.className).toContain("tn-sortable-grip");
        // Inside what the card draws for an entry, which is the rest of the segment.
        expect(first.querySelector(".tn-sortable-content")?.lastElementChild?.className)
            .toContain("board-template-remove");
    });

    it("stores the order the reader puts them in", () => {
        draw();

        press(segments()[0], "ArrowDown", { ctrlKey: true });

        expect(stored).toEqual([ [ "type:code:text/x-markdown", "type:text:text/html" ] ]);
    });

    it("takes an entry away, and leaves the last one alone", () => {
        draw();

        act(() => { segments()[0].querySelector<HTMLElement>(".board-template-remove")?.click(); });

        expect(stored).toEqual([ [ "type:code:text/x-markdown" ] ]);
        // And gone from the card, which is drawn from the list this dialog holds rather than from
        // the board it wrote to.
        expect(captions()).toEqual([ "Markdown" ]);

        // Nothing to make a card from is nothing the board could make one with, so the way to
        // take the last one away is not offered at all.
        offered = [ "type:text:text/html" ];
        draw();
        expect(segments()[0].querySelector(".board-template-remove")).toBeNull();
    });

    describe("adding one", () => {
        it("offers the note types and the reader's own templates, and not the app's", async () => {
            const picking = vi.spyOn(dialog, "pickSingleItem").mockResolvedValue(null);
            draw();

            await add("board_view.add-existing-template");

            const groups = picking.mock.calls.at(-1)?.[0].items as {
                key: string, items: { key: string }[]
            }[];
            expect(groups.map((group) => group.key)).toEqual([ "type", "user" ]);
            // What the board already offers is left out, as is everything the app ships.
            expect(groups.flatMap((group) => group.items.map((item) => item.key)))
                .toEqual([ "type:canvas:application/json", "template:mine" ]);
        });

        it("adds what was picked to the end of the list", async () => {
            vi.spyOn(dialog, "pickSingleItem")
                .mockResolvedValue({ key: "template:mine", caption: "My template" });
            draw();

            await add("board_view.add-existing-template");

            expect(stored.at(-1))
                .toEqual([ "type:text:text/html", "type:code:text/x-markdown", "template:mine" ]);
            expect(captions()).toEqual([ "Text", "Markdown", "My template" ]);
        });

        it("adds nothing where the reader backed out of the picker", async () => {
            vi.spyOn(dialog, "pickSingleItem").mockResolvedValue(null);
            draw();

            await add("board_view.add-existing-template");

            expect(stored).toEqual([]);
            expect(captions()).toEqual([ "Text", "Markdown" ]);
        });

        /** The second way in is drawn, and does nothing yet. */
        it("offers a way to make one, which makes nothing for now", async () => {
            draw();

            expect(adders().map((button) => button.textContent)).toEqual([
                "board_view.add-existing-template", "board_view.create-template"
            ]);

            await add("board_view.create-template");
            expect(stored).toEqual([]);
        });
    });

    // #region The dialog, and what the test does to it

    function draw() {
        const api = {
            getCardTemplateIds: () => offered,
            setCardTemplateIds: async (ids: string[]) => { stored.push(ids); }
        } as unknown as BoardApi;

        act(() => {
            render(
                <BoardProperties api={api} available={AVAILABLE} shown onClose={() => {}} />,
                container);
        });
    }

    function dialog_() {
        return document.querySelector<HTMLElement>(".board-properties-dialog");
    }

    function segments() {
        return [ ...(dialog_()?.querySelectorAll<HTMLElement>(".tn-sortable-segment") ?? []) ];
    }

    function captions() {
        return segments().map((element) =>
            element.querySelector(".board-template-name")?.textContent);
    }

    function adders() {
        return [ ...(dialog_()?.querySelectorAll<HTMLElement>(".tn-sortable-adder") ?? []) ];
    }

    async function add(label: string) {
        const button = adders().find((element) => element.textContent === label);
        await act(async () => {
            button?.click();
            await Promise.resolve();
            await Promise.resolve();
        });
    }

    function press(target: Element, key: string, options: KeyboardEventInit = {}) {
        act(() => {
            target.dispatchEvent(
                new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }));
        });
    }

    // #endregion
});
