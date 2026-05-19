import { DEFAULT_CUSTOM_TASK_STATES, DEFAULT_TASK_STATES, DONE_TASK_STATE, NONE_TASK_STATE, type TaskStateDef } from "@triliumnext/commons";
import { t } from "i18next";

import becca from "../becca/becca.js";
import BAttribute from "../becca/entities/battribute.js";
import noteService from "./notes.js";

export const TASK_STATES_CONTAINER_ID = "_taskStates";
const NONE_NOTE_ID = "_taskStateNone";
const DONE_NOTE_ID = "_taskStateDone";

function noteIdForState(name: string): string {
    return `_taskState${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

/**
 * Returns the task states from the `_taskStates` hidden subtree, in note order.
 * The `none`/`done` anchor notes map to their fixed built-in definitions; other
 * children are read from their promoted attributes. Falls back to
 * {@link DEFAULT_TASK_STATES} when the container is missing or empty.
 */
export function getTaskStates(): TaskStateDef[] {
    const container = becca.notes[TASK_STATES_CONTAINER_ID];
    if (!container) {
        return DEFAULT_TASK_STATES;
    }

    const states = container.getChildNotes()
        .map((note): TaskStateDef | null => {
            if (note.noteId === NONE_NOTE_ID) {
                return NONE_TASK_STATE;
            }
            if (note.noteId === DONE_NOTE_ID) {
                return DONE_TASK_STATE;
            }
            const name = note.getLabelValue("stateName");
            if (!name) {
                return null;
            }
            return {
                name,
                title: note.title,
                markdownSymbol: note.getLabelValue("markdownSymbol") ?? "",
                checkboxValue: note.getLabelValue("checkboxValue") === "true",
                color: note.getLabelValue("color") ?? "",
                icon: note.getLabelValue("iconClass") ?? ""
            };
        })
        .filter((state): state is TaskStateDef => state !== null);

    return states.length ? states : DEFAULT_TASK_STATES;
}

/**
 * Seeds the customizable default task states under the `_taskStates` container
 * and applies the default ordering across all states (anchors included). Called
 * exactly once — when the container is first created — so user changes stick.
 */
export function seedDefaultTaskStates() {
    const titleKeys: Record<string, string> = {
        doing: "hidden-subtree.task-state-doing",
        maybe: "hidden-subtree.task-state-maybe",
        cancelled: "hidden-subtree.task-state-cancelled"
    };

    for (const state of DEFAULT_CUSTOM_TASK_STATES) {
        const {note} = noteService.createNewNote({
            noteId: noteIdForState(state.name),
            title: t(titleKeys[state.name]),
            type: "text",
            parentNoteId: TASK_STATES_CONTAINER_ID,
            content: "",
            ignoreForbiddenParents: true
        });

        const labels: Record<string, string> = {
            iconClass: state.icon,
            stateName: state.name,
            markdownSymbol: state.markdownSymbol,
            checkboxValue: String(state.checkboxValue),
            color: state.color
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

    // Apply the default ordering (None, Doing, Done, Maybe, Cancelled) across all states.
    DEFAULT_TASK_STATES.forEach((state, index) => {
        const note = becca.notes[noteIdForState(state.name)];
        const branch = note?.getParentBranches().find((b) => b.parentNoteId === TASK_STATES_CONTAINER_ID);
        if (branch) {
            branch.notePosition = index * 10;
            branch.save();
        }
    });
}
