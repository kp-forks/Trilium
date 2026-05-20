/**
 * Definition of a todo-list task state.
 *
 * States are ordered. Two of them are built-in, non-customizable **anchors**:
 * `none` (unchecked) and `done` (checked) — CKEditor's native checkbox states.
 * They exist as notes only so the user can position them relative to the
 * customizable states for toolbar order and keyboard cycling.
 */
export interface TaskStateDef {
    /** The `stateName` label value — used verbatim as the `data-trilium-task-state` attribute. */
    name: string;
    /** Human-readable display name (the state note's title). */
    title: string;
    /** Single-character markdown marker, e.g. `/` for `- [/]`. */
    markdownSymbol: string;
    /** Whether the checkbox renders as checked while in this state. */
    checkboxValue: boolean;
    /** CSS color associated with the state, e.g. `#e6a23c`. */
    color: string;
    /** Icon class, e.g. `bx bx-loader`. */
    icon: string;
}

/** Reserved name of the built-in unchecked anchor state. */
export const NONE_STATE_NAME = "none";
/** Reserved name of the built-in checked anchor state. */
export const DONE_STATE_NAME = "done";

/** Whether `name` is a built-in anchor state (`none`/`done`) rather than a customizable one. */
export function isAnchorState(name: string): boolean {
    return name === NONE_STATE_NAME || name === DONE_STATE_NAME;
}

/** The built-in unchecked anchor state. */
export const NONE_TASK_STATE: TaskStateDef = {
    name: NONE_STATE_NAME, title: "None", markdownSymbol: " ", checkboxValue: false, color: "", icon: "bx bx-checkbox"
};

/** The built-in checked anchor state. */
export const DONE_TASK_STATE: TaskStateDef = {
    name: DONE_STATE_NAME, title: "Done", markdownSymbol: "x", checkboxValue: true, color: "#4de64d", icon: "bx bx-check"
};

/**
 * The user-customizable default states, seeded under `_taskStates` on a fresh
 * installation.
 */
export const DEFAULT_CUSTOM_TASK_STATES: TaskStateDef[] = [
    {name: "doing", title: "Doing", markdownSymbol: "/", checkboxValue: false, color: "#e6a23c", icon: "bx bx-loader"},
    {name: "maybe", title: "Maybe", markdownSymbol: "?", checkboxValue: false, color: "#4d4de6", icon: "bx bx-question-mark"},
    {name: "cancelled", title: "Cancelled", markdownSymbol: "-", checkboxValue: false, color: "#e64d4d", icon: "bx bx-block"}
];

/**
 * The full default ordered sequence — `None, Doing, Done, Maybe, Cancelled`.
 * Used as the fallback wherever the user-defined states are not reachable.
 */
export const DEFAULT_TASK_STATES: TaskStateDef[] = [
    NONE_TASK_STATE,
    DEFAULT_CUSTOM_TASK_STATES[0],
    DONE_TASK_STATE,
    DEFAULT_CUSTOM_TASK_STATES[1],
    DEFAULT_CUSTOM_TASK_STATES[2]
];
