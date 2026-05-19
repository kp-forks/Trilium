import { Plugin } from "ckeditor5";
import TodoListClassEditing from "./todo_list_class_editing.js";
import TodoListClassToolbar from "./todo_list_class_toolbar.js";
import TodoListClassUI from "./todo_list_class_ui.js";

export default class TodoListClass extends Plugin {

    static get requires() {
        return [TodoListClassEditing, TodoListClassUI, TodoListClassToolbar] as const;
    }

}
