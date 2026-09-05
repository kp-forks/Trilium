import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type FNote from "../../entities/fnote";
import dialog from "../../services/dialog";
import note_create from "../../services/note_create";
import { getNoteTypeOptions, type NoteTypeOption } from "../../services/note_types";
import TemplateSelectionCard from "./TemplateSelectionCard";

// i18next is never initialised under test, so every label would read as undefined.
vi.mock("../../services/i18n", () => ({
    t: (key: string) => key
}));

// The listing is the app's and is tested there; the card is handed a short one of each kind.
vi.mock("../../services/note_types", async () => {
    const actual = await vi.importActual<typeof import("../../services/note_types")>(
        "../../services/note_types");
    return { ...actual, getNoteTypeOptions: vi.fn(async () => AVAILABLE) };
});

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

/** The note a template made here is filed under. */
const OWNER = { noteId: "owner1" } as FNote;

describe("TemplateSelectionCard", () => {
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
        render(null, container);
        container.remove();
    });

    it("lists what it is given, in the order it is given them, under the caller's words", async () => {
        await draw();

        expect(captions()).toEqual([ "Text", "Markdown" ]);
        expect(container.querySelector(".tn-card-heading")?.textContent).toContain("What to use");
        expect(container.querySelector(".tn-card-description")?.textContent)
            .toBe("Pick what a new one is made from.");
    });

    /** The grip leads, so the trailing edge is left to what each entry carries there. */
    it("carries the grip at the start of an entry and the way to remove it at the end", async () => {
        await draw();
        const [ first ] = segments();

        expect(first.firstElementChild?.className).toContain("tn-sortable-grip");
        // Inside what the card draws for an entry, which is the rest of the segment.
        expect(first.querySelector(".tn-sortable-content")?.lastElementChild?.className)
            .toContain("template-selection-remove");
    });

    it("stores the order the reader puts them in", async () => {
        await draw();

        press(segments()[0], "ArrowDown", { ctrlKey: true });

        expect(stored).toEqual([ [ "type:code:text/x-markdown", "type:text:text/html" ] ]);
    });

    it("takes an entry away, and leaves the last one alone", async () => {
        await draw();

        act(() => { segments()[0].querySelector<HTMLElement>(".template-selection-remove")?.click(); });

        expect(stored).toEqual([ [ "type:code:text/x-markdown" ] ]);
        // And gone from the card, which is drawn from the list this dialog holds rather than from
        // the board it wrote to.
        expect(captions()).toEqual([ "Markdown" ]);

        // Nothing to make a card from is nothing the board could make one with, so the way to
        // take the last one away is not offered at all.
        offered = [ "type:text:text/html" ];
        await draw();
        expect(segments()[0].querySelector(".template-selection-remove")).toBeNull();
    });

    describe("adding one", () => {
        it("offers the note types and the reader's own templates, and not the app's", async () => {
            const picking = vi.spyOn(dialog, "pickSingleItem").mockResolvedValue(null);
            await draw();

            await add("template_selection.add-existing");

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
            await draw();

            await add("template_selection.add-existing");

            expect(stored.at(-1))
                .toEqual([ "type:text:text/html", "type:code:text/x-markdown", "template:mine" ]);
            expect(captions()).toEqual([ "Text", "Markdown", "My template" ]);
        });

        it("adds nothing where the reader backed out of the picker", async () => {
            vi.spyOn(dialog, "pickSingleItem").mockResolvedValue(null);
            await draw();

            await add("template_selection.add-existing");

            expect(stored).toEqual([]);
            expect(captions()).toEqual([ "Text", "Markdown" ]);
        });

        /**
         * The second way in makes a template of its own: a note under the board carrying
         * `#template`, opened for the reader to write, and offered by the board from then on.
         */
        it("makes a template under the board, and offers it from then on", async () => {
            const made = vi.spyOn(note_create, "createTemplateNote").mockResolvedValue({
                noteId: "fresh",
                title: "template_selection.new-name",
                type: "text",
                mime: "text/html",
                getIcon: () => "bx bx-note"
            } as unknown as FNote);
            await draw();

            expect(adders().map((button) => button.textContent)).toEqual([
                "template_selection.add-existing", "template_selection.create"
            ]);

            await add("template_selection.create");

            expect(made).toHaveBeenCalledWith("owner1", "template_selection.new-name");
            expect(stored.at(-1)).toEqual([
                "type:text:text/html", "type:code:text/x-markdown", "template:fresh"
            ]);
            // Drawn straight away: the board has yet to hear of the note this was made from.
            expect(captions()).toEqual([ "Text", "Markdown", "template_selection.new-name" ]);
        });

        /** A caller whose templates are all of one kind says what one is called. */
        it("calls a template what the caller calls one", async () => {
            const made = vi.spyOn(note_create, "createTemplateNote").mockResolvedValue({
                noteId: "fresh",
                title: "New card template",
                type: "text",
                mime: "text/html",
                getIcon: () => "bx bx-note"
            } as unknown as FNote);
            await draw({ newTemplateName: "New card template" });

            await add("template_selection.create");

            expect(made).toHaveBeenCalledWith("owner1", "New card template");
            expect(captions().at(-1)).toBe("New card template");
        });

        it("adds nothing where the template could not be made", async () => {
            vi.spyOn(note_create, "createTemplateNote").mockResolvedValue(undefined);
            await draw();

            await add("template_selection.create");

            expect(stored).toEqual([]);
            expect(captions()).toEqual([ "Text", "Markdown" ]);
        });
    });

    // #region The dialog, and what the test does to it

    /** Drawn, and given the moment it takes to read what a note can be made from. */
    async function draw({ newTemplateName }: { newTemplateName?: string } = {}) {
        await act(async () => {
            render(
                <TemplateSelectionCard
                    heading="What to use"
                    instruction="Pick what a new one is made from."
                    note={OWNER}
                    newTemplateName={newTemplateName}
                    templates={offered}
                    onChange={(ids) => stored.push(ids)}
                />,
                container);
            await Promise.resolve();
        });
    }

    function segments() {
        return [ ...container.querySelectorAll<HTMLElement>(".tn-sortable-segment") ];
    }

    function captions() {
        return segments().map((element) =>
            element.querySelector(".template-selection-name")?.textContent);
    }

    function adders() {
        return [ ...container.querySelectorAll<HTMLElement>(".tn-sortable-adder") ];
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
