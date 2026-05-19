import { DEFAULT_TASK_STATES, type TaskStateDef } from "@triliumnext/commons";
import { Tooltip } from "bootstrap";
import { Command, ListEditing, Plugin, TodoList, type Editor, type ModelElement, type ViewElement } from "ckeditor5";

export const TASK_STATE_ATTRIBUTE = "taskState";
const TODO_LIST_CHECKED_ATTRIBUTE = "todoListChecked";

/**
 * The configured non-binary task states. `none` (unchecked) and `done` (checked)
 * are CKEditor's native checkbox behaviour and are not part of this list.
 */
export function getConfiguredTaskStates(editor: Editor): TaskStateDef[] {
    const states = editor.config.get("taskStates") as TaskStateDef[] | undefined;
    return states && states.length ? states : DEFAULT_TASK_STATES;
}

export default class TodoListMultistateEditing extends Plugin {

    static get requires() {
        return [TodoList, ListEditing] as const;
    }

    init() {
        const editor = this.editor;
        const states = getConfiguredTaskStates(editor);
        const stateByName = new Map(states.map((state) => [state.name, state]));

        editor.model.schema.extend("$block", {allowAttributes: TASK_STATE_ATTRIBUTE});

        editor.commands.add("setTaskState", new SetTaskStateCommand(editor));

        editor.keystrokes.set("Ctrl+Shift+Enter", (_data, cancel) => {
            const command = editor.commands.get("setTaskState");
            if (!command?.isEnabled) {
                return;
            }
            const cycle: (string | null)[] = [null, ...states.map((state) => state.name)];
            const current = (command.value as string | null) ?? null;
            const idx = cycle.indexOf(current);
            const next = cycle[(idx + 1) % cycle.length];
            editor.execute("setTaskState", {state: next});
            cancel();
        });

        const listEditing = editor.plugins.get(ListEditing);
        listEditing.registerDowncastStrategy({
            scope: "item",
            attributeName: TASK_STATE_ATTRIBUTE,
            setAttributeOnDowncast(writer, value, element) {
                if (typeof value === "string" && stateByName.has(value)) {
                    writer.setAttribute("data-task-state", value, element);
                } else {
                    writer.removeAttribute("data-task-state", element);
                }
            }
        });

        editor.conversion.for("upcast").attributeToAttribute({
            view: {key: "data-task-state"},
            model: {
                key: TASK_STATE_ATTRIBUTE,
                value: (viewElement: ViewElement) => {
                    const value = viewElement.getAttribute("data-task-state");
                    return typeof value === "string" && stateByName.has(value) ? value : null;
                }
            }
        });

        this.listenTo(editor.editing.view, "render", () => {
            const domRoot = editor.editing.view.getDomRoot();
            if (!domRoot) {
                return;
            }
            for (const input of domRoot.querySelectorAll<HTMLInputElement>(".todo-list__label input[type=\"checkbox\"]")) {
                if (!Tooltip.getInstance(input)) {
                    new Tooltip(input, {title: "Tooltip"});
                }
            }
        });

        editor.model.document.registerPostFixer((writer) => {
            const differ = editor.model.document.differ;
            const stateChanged = new Set<ModelElement>();
            const checkedChanged = new Set<ModelElement>();

            for (const entry of differ.getChanges()) {
                if (entry.type !== "attribute") {
                    continue;
                }
                const node = entry.range.start.nodeAfter;
                if (!node || !node.is("element")) {
                    continue;
                }
                if (node.getAttribute("listType") !== "todo") {
                    continue;
                }
                if (entry.attributeKey === TASK_STATE_ATTRIBUTE) {
                    stateChanged.add(node as ModelElement);
                } else if (entry.attributeKey === TODO_LIST_CHECKED_ATTRIBUTE) {
                    checkedChanged.add(node as ModelElement);
                }
            }

            let changed = false;

            // A configured state forces the checkbox to its `checkboxValue`.
            for (const el of stateChanged) {
                const stateName = el.getAttribute(TASK_STATE_ATTRIBUTE);
                const state = typeof stateName === "string" ? stateByName.get(stateName) : undefined;
                if (!state) {
                    // State cleared — leave the native checkbox (none/done) untouched.
                    continue;
                }
                if (!!el.getAttribute(TODO_LIST_CHECKED_ATTRIBUTE) !== state.checkboxValue) {
                    writer.setAttribute(TODO_LIST_CHECKED_ATTRIBUTE, state.checkboxValue, el);
                    changed = true;
                }
            }

            // Toggling the native checkbox drops any special state (back to native none/done).
            for (const el of checkedChanged) {
                if (stateChanged.has(el)) {
                    continue;
                }
                if (el.getAttribute(TASK_STATE_ATTRIBUTE) !== undefined) {
                    writer.removeAttribute(TASK_STATE_ATTRIBUTE, el);
                    changed = true;
                }
            }

            return changed;
        });
    }

}

class SetTaskStateCommand extends Command {

    declare public value: string | null;

    refresh() {
        const block = this._getTodoBlock();
        this.isEnabled = !!block;
        if (!block) {
            this.value = null;
            return;
        }
        const stored = block.getAttribute(TASK_STATE_ATTRIBUTE);
        this.value = typeof stored === "string" ? stored : null;
    }

    execute(options: {state: string | null}) {
        const model = this.editor.model;
        const {state} = options;
        model.change((writer) => {
            for (const block of model.document.selection.getSelectedBlocks()) {
                if (block.getAttribute("listType") !== "todo") {
                    continue;
                }
                if (!state || state === "none") {
                    writer.removeAttribute(TASK_STATE_ATTRIBUTE, block);
                } else {
                    writer.setAttribute(TASK_STATE_ATTRIBUTE, state, block);
                }
            }
        });
    }

    private _getTodoBlock(): ModelElement | null {
        const position = this.editor.model.document.selection.getFirstPosition();
        const parent = position?.parent;
        if (!parent || !parent.is("element")) {
            return null;
        }
        return parent.getAttribute("listType") === "todo" ? (parent as ModelElement) : null;
    }

}
