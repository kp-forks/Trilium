import { ButtonView, Plugin } from "ckeditor5";
import TodoListClassEditing, { TODO_LIST_CLASSES, type TodoListClass } from "./todo_list_class_editing.js";

export default class TodoListClassUI extends Plugin {

    static get requires() {
        return [TodoListClassEditing] as const;
    }

    init() {
        const editor = this.editor;
        const command = editor.commands.get("todoListItemClass")!;

        editor.ui.componentFactory.add("todoListClass:none", (locale) => {
            const button = new ButtonView(locale);
            button.set({
                label: "—",
                withText: true,
                tooltip: editor.t("Clear class"),
                class: "ck-todo-list-class-button ck-todo-list-class-none"
            });
            button.bind("isOn").to(command, "value", (value) => value === null);
            button.bind("isEnabled").to(command, "isEnabled");
            button.on("execute", () => {
                editor.execute("todoListItemClass", {className: null});
                editor.editing.view.focus();
            });
            return button;
        });

        for (const className of TODO_LIST_CLASSES) {
            const componentName = `todoListClass:${className}`;
            editor.ui.componentFactory.add(componentName, (locale) => {
                const button = new ButtonView(locale);
                button.set({
                    label: className.toUpperCase(),
                    withText: true,
                    tooltip: editor.t("Apply class %0", [`todo-list-${className}`]),
                    class: `ck-todo-list-class-button ck-todo-list-class-${className}`
                });
                button.bind("isOn").to(command, "value", (value) => value === className);
                button.bind("isEnabled").to(command, "isEnabled");
                button.on("execute", () => {
                    editor.execute("todoListItemClass", {className: className as TodoListClass});
                    editor.editing.view.focus();
                });
                return button;
            });
        }
    }

}
