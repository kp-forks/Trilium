import { ButtonView, Plugin } from "ckeditor5";
import TodoListMultistateEditing, { getConfiguredTaskStates } from "./todo_list_multistate_editing.js";

export default class TodoListMultistateUI extends Plugin {

    static get requires() {
        return [TodoListMultistateEditing] as const;
    }

    init() {
        const editor = this.editor;
        const command = editor.commands.get("setTaskState")!;

        for (const state of getConfiguredTaskStates(editor)) {
            editor.ui.componentFactory.add(`taskState:${state.name}`, (locale) => {
                const button = new ButtonView(locale);
                button.set({
                    label: state.title || state.name,
                    withText: false,
                    tooltip: true,
                    class: `ck-task-state-button ck-task-state-${state.name}${state.icon ? ` ${state.icon}` : ""}`
                });
                if (state.color) {
                    button.extendTemplate({
                        attributes: {style: `--task-state-color:${state.color}`}
                    });
                }
                button.bind("isOn").to(command, "value", (value) => value === state.name);
                button.bind("isEnabled").to(command, "isEnabled");
                button.on("execute", () => {
                    editor.execute("setTaskState", {state: state.name});
                    editor.editing.view.focus();
                });
                return button;
            });
        }
    }

}
