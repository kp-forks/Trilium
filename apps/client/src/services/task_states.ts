import {
    DEFAULT_TASK_STATES,
    DONE_STATE_ID,
    DONE_TASK_STATE,
    NONE_STATE_ID,
    NONE_TASK_STATE,
    TASK_STATES_CONTAINER_ID,
    type TaskStateDef,
    type TaskStateValidationError,
    validateTaskStates
} from "@triliumnext/commons";

import appContext from "../components/app_context.js";
import froca from "./froca.js";
import { showError } from "./toast.js";

let validationReported = false;

/** Surfaces dropped-task-state warnings once per session — as a toast and in the console. */
function reportValidationErrors(errors: TaskStateValidationError[]) {
    if (validationReported || errors.length === 0) {
        return;
    }
    validationReported = true;
    for (const error of errors) {
        showError(error.message);
    }
}

/**
 * Enumerates the configured task states from the `_taskStates` hidden subtree,
 * dropping invalid definitions and reporting them once. Shared by the text
 * editor, kanban and the todo collection view.
 */
export async function getTaskStateDefinitions(): Promise<TaskStateDef[]> {
    const container = await froca.getNote(TASK_STATES_CONTAINER_ID);
    if (!container) {
        return DEFAULT_TASK_STATES;
    }

    const states = (await container.getChildNotes())
        .map((note): TaskStateDef | null => {
            if (note.noteId === NONE_STATE_ID) {
                return NONE_TASK_STATE;
            }
            if (note.noteId === DONE_STATE_ID) {
                return DONE_TASK_STATE;
            }
            // Archived definition notes are completely ignored — never enumerated.
            if (note.isArchived) {
                return null;
            }
            return {
                id: note.noteId,
                name: note.getLabelValue("stateName") ?? "",
                title: note.title,
                markdownSymbol: note.getLabelValue("markdownSymbol") ?? "",
                isCompleted: note.getLabelValue("isCompleted") === "true",
                color: note.getLabelValue("color") ?? "",
                icon: note.getLabelValue("iconClass") ?? "",
                isHidden: note.getLabelValue("isHidden") === "true"
            };
        })
        .filter((state): state is TaskStateDef => state !== null);

    const {valid, errors} = validateTaskStates(states);
    reportValidationErrors(errors);
    return valid.length ? valid : DEFAULT_TASK_STATES;
}

/** Opens the "Task States" configuration note in a new tab, hoisted to it. */
export function openCustomTaskStateConfig(): void {
    void appContext.tabManager.openInNewTab(TASK_STATES_CONTAINER_ID, TASK_STATES_CONTAINER_ID, true);
}
