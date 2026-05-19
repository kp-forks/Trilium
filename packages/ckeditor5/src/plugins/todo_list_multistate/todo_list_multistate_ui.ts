import { ButtonView, Plugin } from "ckeditor5";
import TodoListMultistateEditing, { TASK_STATES, type TaskState } from "./todo_list_multistate_editing.js";

const STATE_LABELS: Record<TaskState, string> = {
    none: "None",
    doing: "Doing",
    done: "Done",
    maybe: "Maybe",
    cancelled: "Cancelled"
};

export default class TodoListMultistateUI extends Plugin {

    static get requires() {
        return [TodoListMultistateEditing] as const;
    }

    init() {
        const editor = this.editor;
        const command = editor.commands.get("setTaskState")!;

        for (const state of TASK_STATES) {
            const componentName = `taskState:${state}`;
            editor.ui.componentFactory.add(componentName, (locale) => {
                const button = new ButtonView(locale);
                button.set({
                    label: STATE_LABELS[state],
                    withText: false,
                    tooltip: true,
                    class: `ck-task-state-button ck-task-state-${state}`
                });
                button.bind("isOn").to(command, "value", (value) => value === state);
                button.bind("isEnabled").to(command, "isEnabled");
                button.on("execute", () => {
                    editor.execute("setTaskState", {state: state as TaskState});
                    editor.editing.view.focus();
                });
                return button;
            });
        }
    }

}
