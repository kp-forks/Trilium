/**
 * Regression test for the dashboard (and other collection views) intermittently not refreshing
 * after a note is dragged in from the tree.
 *
 * `useNoteIds` refreshes its id list by calling `note.getChildNoteIdsWithArchiveFiltering()`, which
 * does a server round-trip (archive filtering search). Several refreshes can be in flight at once
 * (initial mount, an `entitiesReloaded` from the clone, an `includeArchived` change). Without
 * sequencing, whichever server response lands *last* wins — so a stale, pre-clone result can clobber
 * the fresh post-clone one, leaving the new widget invisible until a manual reload. The hook guards
 * against this by only committing the most recently issued refresh.
 */
import { deferred } from "@triliumnext/commons";
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Component from "../../components/component";
import type FNote from "../../entities/fnote";
import type { EntityChange } from "../../server_types";
import LoadResults from "../../services/load_results";
import { buildNote } from "../../test/easy-froca";
import { ParentComponent } from "../react/react_utils";
import { useNoteIds } from "./NoteList";

let currentNoteIds: string[] = [];

/** Drains the chained awaits in `refreshNoteIds` (getNoteIds → search promise → setNoteIds). */
async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve));
}

/** Renders `useNoteIds` and exposes its current value through the module-level `currentNoteIds`. */
function Harness({ note }: { note: FNote }) {
    currentNoteIds = useNoteIds(note, "dashboard", "ntx-1");
    return null;
}

function branchEntitiesReloaded(parentNoteId: string, childNoteId: string) {
    const branchId = `br-${childNoteId}`;
    const loadResults = new LoadResults([
        {
            entityName: "branches",
            entityId: branchId,
            entity: { branchId, parentNoteId, noteId: childNoteId },
            componentId: "comp-1"
        } as unknown as EntityChange
    ]);
    loadResults.addBranch(branchId, "comp-1");
    return loadResults;
}

describe("useNoteIds refresh race", () => {
    let container: HTMLElement | undefined;

    beforeEach(() => {
        currentNoteIds = [];
    });

    afterEach(() => {
        if (container) {
            render(null, container);
            container.remove();
            container = undefined;
        }
    });

    function setup() {
        const note = buildNote({ title: "Dashboard", type: "book" });

        // Each refresh's child-id lookup hangs until the test resolves it, so resolution order is
        // fully controllable (it stands in for a slow/variable-latency server search).
        const pending: ReturnType<typeof deferred<string[]>>[] = [];
        note.getChildNoteIdsWithArchiveFiltering = vi.fn(() => {
            const d = deferred<string[]>();
            pending.push(d);
            return d;
        });

        const parent = new Component();
        container = document.createElement("div");
        document.body.appendChild(container);

        return { note, pending, parent };
    }

    it("commits the newest refresh even when an older one resolves last", async () => {
        const { note, pending, parent } = setup();

        // Mount issues the first refresh (reflecting the pre-clone child set).
        await act(async () => {
            render(
                <ParentComponent.Provider value={parent}>
                    <Harness note={note} />
                </ParentComponent.Provider>,
                container
            );
        });

        // The clone arrives as an entitiesReloaded with a branch under this note, issuing a second refresh.
        await act(async () => {
            await parent.handleEvent("entitiesReloaded", {
                loadResults: branchEntitiesReloaded(note.noteId, "child-new")
            });
        });

        expect(pending).toHaveLength(2);

        // The newer refresh resolves first with the post-clone set...
        await act(async () => {
            pending[1].resolve(["child-new"]);
            await flushMicrotasks();
        });
        // ...then the stale one resolves with the pre-clone set and must NOT clobber it.
        await act(async () => {
            pending[0].resolve([]);
            await flushMicrotasks();
        });

        expect(currentNoteIds).toEqual(["child-new"]);
    });

    it("applies a single refresh's result normally", async () => {
        const { note, pending, parent } = setup();

        await act(async () => {
            render(
                <ParentComponent.Provider value={parent}>
                    <Harness note={note} />
                </ParentComponent.Provider>,
                container
            );
        });

        expect(pending).toHaveLength(1);
        await act(async () => {
            pending[0].resolve(["child-a", "child-b"]);
            await flushMicrotasks();
        });

        expect(currentNoteIds).toEqual(["child-a", "child-b"]);
    });
});
