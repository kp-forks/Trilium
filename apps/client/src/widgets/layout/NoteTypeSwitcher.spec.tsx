import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import Component from "../../components/component.js";
import type FNote from "../../entities/fnote.js";
import { buildNote } from "../../test/easy-froca.js";
import { ParentComponent } from "../react/react_utils.js";
import { useBuiltinTemplates } from "./NoteTypeSwitcher.js";

let container: HTMLDivElement;

afterEach(() => {
    act(() => render(null, container));
    container.remove();
});

function mountHook() {
    const host = new Component();
    let templates: { builtinTemplates: FNote[]; collectionTemplates: FNote[] } | undefined;

    function Harness() {
        templates = useBuiltinTemplates();
        return null;
    }

    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => render(<ParentComponent.Provider value={host}><Harness /></ParentComponent.Provider>, container));

    return { host, getTemplates: () => templates };
}

// The hook resolves the root note, re-renders, then resolves the children — each async step
// needs its own act() round so the intermediate state commits and the next effect fires.
async function flush() {
    for (let i = 0; i < 3; i++) {
        await act(async () => { await new Promise((resolve) => setTimeout(resolve)); });
    }
}

describe("useBuiltinTemplates", () => {
    it("swaps to fresh FNote refs on frocaReloaded (protected template titles decrypt after unlock)", async () => {
        // Locked protected session: the built-in template titles are the encrypted placeholder.
        buildNote({
            id: "_templates",
            title: "Templates",
            children: [
                { id: "_templateA", title: "[protected]", "#template": "" },
                { id: "_templateB", title: "[protected]", "#template": "", "#collection": "" }
            ]
        });

        const { host, getTemplates } = mountHook();
        await flush();

        const stale = getTemplates();
        expect(stale?.builtinTemplates.map((note) => note.title)).toEqual([ "[protected]" ]);
        expect(stale?.collectionTemplates.map((note) => note.title)).toEqual([ "[protected]" ]);

        // Unlocking rebuilds froca from scratch: same noteIds, brand-new FNote instances,
        // now with decrypted titles. The old instances stay orphaned in the hook's state
        // unless frocaReloaded triggers a re-resolve.
        buildNote({
            id: "_templates",
            title: "Templates",
            children: [
                { id: "_templateA", title: "Grid View", "#template": "" },
                { id: "_templateB", title: "Board", "#template": "", "#collection": "" }
            ]
        });

        await act(async () => { await host.handleEvent("frocaReloaded", {}); });
        await flush();

        const fresh = getTemplates();
        expect(fresh?.builtinTemplates.map((note) => note.title)).toEqual([ "Grid View" ]);
        expect(fresh?.collectionTemplates.map((note) => note.title)).toEqual([ "Board" ]);
        expect(fresh?.builtinTemplates[0]).not.toBe(stale?.builtinTemplates[0]);
    });
});
