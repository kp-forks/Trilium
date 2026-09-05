import { Modal as BootstrapModal } from "bootstrap";
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type FNote from "../../../entities/fnote";
import BoardApi from "./api";
import BoardProperties from "./properties";

// i18next is never initialised under test, so every label would read as undefined.
vi.mock("../../../services/i18n", () => ({
    t: (key: string) => key
}));

// The card is the app's and is tested where it lives; what the board answers for is the words it is
// given and where what it holds is written.
vi.mock("../../react/TemplateSelectionCard", () => ({
    default: ({ heading, instruction, note, templates, onChange }: {
        heading: string, instruction: string, note: FNote, templates: string[],
        onChange: (templates: string[]) => void
    }) => (
        <div
            className="templates-stub"
            data-heading={heading}
            data-instruction={instruction}
            data-note={note.noteId}
            data-templates={templates.join(",")}
            onClick={() => onChange([ "type:canvas:application/json" ])}
        />
    )
}));

describe("Board properties", () => {
    let container: HTMLElement;
    let stored: string[][];

    beforeEach(() => {
        stored = [];
        container = document.createElement("div");
        document.body.appendChild(container);

        const api = {
            getCardTemplateIds: () => [ "type:text:text/html" ],
            setCardTemplateIds: async (ids: string[]) => { stored.push(ids); }
        } as unknown as BoardApi;

        act(() => {
            render(
                <BoardProperties
                    api={api}
                    note={{ noteId: "board1" } as FNote}
                    shown
                    onClose={() => {}}
                />,
                container);
        });
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

    it("holds the card templates, named and explained in the board's own words", () => {
        const card = dialog()?.querySelector<HTMLElement>(".templates-stub");

        expect(dialog()?.querySelector(".modal-title")?.textContent)
            .toContain("board_view.properties-title");
        expect(card?.dataset.heading).toBe("board_view.card-templates");
        expect(card?.dataset.instruction).toBe("board_view.card-templates-hint");
        // Filed under the board, and drawn from what the board offers now.
        expect(card?.dataset.note).toBe("board1");
        expect(card?.dataset.templates).toBe("type:text:text/html");
    });

    it("writes what the card answers with back to the board", () => {
        act(() => { dialog()?.querySelector<HTMLElement>(".templates-stub")?.click(); });

        expect(stored).toEqual([ [ "type:canvas:application/json" ] ]);
    });

    function dialog() {
        return document.querySelector<HTMLElement>(".board-properties-dialog");
    }
});
