/**
 * Definition of a configurable todo-list task state.
 *
 * The built-in `none` (unchecked) and `done` (checked) states are NOT task
 * states — they are CKEditor's native checkbox behaviour. Task states only
 * cover the non-binary states (e.g. "doing", "maybe", "cancelled").
 */
export interface TaskStateDef {
    /** The `stateName` label value — used verbatim as the `data-task-state` attribute. */
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

/**
 * Fallback task states, used wherever the user-defined states (stored as notes
 * in the `_taskStates` hidden subtree) are not reachable, and seeded as the
 * defaults on a fresh installation.
 */
export const DEFAULT_TASK_STATES: TaskStateDef[] = [
    {name: "doing", title: "Doing", markdownSymbol: "/", checkboxValue: false, color: "#e6a23c", icon: "bx bx-loader"},
    {name: "maybe", title: "Maybe", markdownSymbol: "?", checkboxValue: false, color: "#a06cd5", icon: "bx bx-help-circle"},
    {name: "cancelled", title: "Cancelled", markdownSymbol: "-", checkboxValue: false, color: "#909399", icon: "bx bx-x"}
];
