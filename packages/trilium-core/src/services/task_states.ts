import { DEFAULT_TASK_STATES, type TaskStateDef } from "@triliumnext/commons";
import { t } from "i18next";

import becca from "../becca/becca.js";
import BAttribute from "../becca/entities/battribute.js";
import noteService from "./notes.js";

export const TASK_STATES_CONTAINER_ID = "_taskStates";

/**
 * Returns the user-defined task states from the `_taskStates` hidden subtree,
 * in note order. Falls back to {@link DEFAULT_TASK_STATES} when the container
 * is missing or empty.
 */
export function getTaskStates(): TaskStateDef[] {
    const container = becca.notes[TASK_STATES_CONTAINER_ID];
    if (!container) {
        return DEFAULT_TASK_STATES;
    }

    const states = container.getChildNotes()
        .map((note): TaskStateDef => ({
            name: note.getLabelValue("stateName") ?? "",
            title: note.title,
            markdownSymbol: note.getLabelValue("markdownSymbol") ?? "",
            checkboxValue: note.getLabelValue("checkboxValue") === "true",
            color: note.getLabelValue("color") ?? "",
            icon: note.getLabelValue("iconClass") ?? ""
        }))
        .filter((state) => state.name);

    return states.length ? states : DEFAULT_TASK_STATES;
}

/**
 * Seeds the default task-state notes under the `_taskStates` container. Called
 * exactly once — when the container is first created — so user deletions stick.
 */
export function seedDefaultTaskStates() {
    const seeds: Array<{noteId: string; title: string; state: TaskStateDef}> = [
        {noteId: "_taskStateDoing", title: t("hidden-subtree.task-state-doing"), state: DEFAULT_TASK_STATES[0]},
        {noteId: "_taskStateMaybe", title: t("hidden-subtree.task-state-maybe"), state: DEFAULT_TASK_STATES[1]},
        {noteId: "_taskStateCancelled", title: t("hidden-subtree.task-state-cancelled"), state: DEFAULT_TASK_STATES[2]}
    ];

    for (const seed of seeds) {
        const {note} = noteService.createNewNote({
            noteId: seed.noteId,
            title: seed.title,
            type: "text",
            parentNoteId: TASK_STATES_CONTAINER_ID,
            content: "",
            ignoreForbiddenParents: true
        });

        const labels: Record<string, string> = {
            iconClass: seed.state.icon,
            stateName: seed.state.name,
            markdownSymbol: seed.state.markdownSymbol,
            checkboxValue: String(seed.state.checkboxValue),
            color: seed.state.color
        };

        for (const [name, value] of Object.entries(labels)) {
            new BAttribute({
                attributeId: `${note.noteId}_l${name}`,
                noteId: note.noteId,
                type: "label",
                name,
                value
            }).save();
        }
    }
}
