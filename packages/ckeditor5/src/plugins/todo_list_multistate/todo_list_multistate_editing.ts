import { Tooltip } from "bootstrap";
import { Command, ListEditing, Plugin, TodoList, type ModelElement, type ViewElement } from "ckeditor5";

export const TASK_STATES = ["none", "doing", "done", "maybe", "cancelled"] as const;
export type TaskState = typeof TASK_STATES[number];
export const TASK_STATE_ATTRIBUTE = "taskState";
const TODO_LIST_CHECKED_ATTRIBUTE = "todoListChecked";

function normaliseState(value: unknown): TaskState | null {
    if (typeof value !== "string") {
        return null;
    }
    const v = value.trim().toLowerCase();
    if (v === "none") {
        return null;
    }
    return (TASK_STATES as readonly string[]).includes(v) ? (v as TaskState) : null;
}

export default class TodoListMultistateEditing extends Plugin {

    static get requires() {
        return [TodoList, ListEditing] as const;
    }

    init() {
        const editor = this.editor;

        editor.model.schema.extend("$block", {allowAttributes: TASK_STATE_ATTRIBUTE});

        editor.commands.add("setTaskState", new SetTaskStateCommand(editor));

        editor.keystrokes.set("Ctrl+Shift+Enter", (_data, cancel) => {
            const command = editor.commands.get("setTaskState");
            if (!command?.isEnabled) {
                return;
            }
            const current = (command.value as TaskState | null) ?? "none";
            const idx = TASK_STATES.indexOf(current);
            const next = TASK_STATES[(idx + 1) % TASK_STATES.length];
            editor.execute("setTaskState", {state: next});
            cancel();
        });

        const listEditing = editor.plugins.get(ListEditing);
        listEditing.registerDowncastStrategy({
            scope: "item",
            attributeName: TASK_STATE_ATTRIBUTE,
            setAttributeOnDowncast(writer, value, element) {
                const state = normaliseState(value);
                if (state) {
                    writer.setAttribute("data-task-state", state, element);
                } else {
                    writer.removeAttribute("data-task-state", element);
                }
            }
        });

        editor.conversion.for("upcast").attributeToAttribute({
            view: {key: "data-task-state"},
            model: {
                key: TASK_STATE_ATTRIBUTE,
                value: (viewElement: ViewElement) => normaliseState(viewElement.getAttribute("data-task-state"))
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

            for (const el of stateChanged) {
                const shouldBeChecked = el.getAttribute(TASK_STATE_ATTRIBUTE) === "done";
                if (!!el.getAttribute(TODO_LIST_CHECKED_ATTRIBUTE) !== shouldBeChecked) {
                    writer.setAttribute(TODO_LIST_CHECKED_ATTRIBUTE, shouldBeChecked, el);
                    changed = true;
                }
            }

            for (const el of checkedChanged) {
                if (stateChanged.has(el)) {
                    continue;
                }
                const checked = !!el.getAttribute(TODO_LIST_CHECKED_ATTRIBUTE);
                const state = el.getAttribute(TASK_STATE_ATTRIBUTE);
                if (checked && state !== "done") {
                    writer.setAttribute(TASK_STATE_ATTRIBUTE, "done", el);
                    changed = true;
                } else if (!checked && state === "done") {
                    writer.removeAttribute(TASK_STATE_ATTRIBUTE, el);
                    changed = true;
                }
            }

            return changed;
        });
    }

}

class SetTaskStateCommand extends Command {

    declare public value: TaskState | null;

    refresh() {
        const block = this._getTodoBlock();
        this.isEnabled = !!block;
        if (!block) {
            this.value = null;
            return;
        }
        const stored = block.getAttribute(TASK_STATE_ATTRIBUTE);
        this.value = typeof stored === "string" && (TASK_STATES as readonly string[]).includes(stored)
            ? (stored as TaskState)
            : "none";
    }

    execute(options: {state: TaskState}) {
        const model = this.editor.model;
        const {state} = options;
        model.change((writer) => {
            for (const block of model.document.selection.getSelectedBlocks()) {
                if (block.getAttribute("listType") !== "todo") {
                    continue;
                }
                if (state === "none") {
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
