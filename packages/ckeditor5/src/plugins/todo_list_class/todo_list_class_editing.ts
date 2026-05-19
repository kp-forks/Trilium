import { Command, ListEditing, Plugin, TodoList, type ModelElement } from "ckeditor5";

export const TODO_LIST_CLASSES = ["a", "b"] as const;
export type TodoListClass = typeof TODO_LIST_CLASSES[number];
export const TODO_LIST_CLASS_ATTRIBUTE = "todoListItemClass";

function isTodoListClass(value: unknown): value is TodoListClass {
    return typeof value === "string" && (TODO_LIST_CLASSES as readonly string[]).includes(value);
}

export default class TodoListClassEditing extends Plugin {

    static get requires() {
        return [TodoList, ListEditing] as const;
    }

    init() {
        const editor = this.editor;

        editor.model.schema.extend("$block", {allowAttributes: TODO_LIST_CLASS_ATTRIBUTE});

        editor.commands.add("todoListItemClass", new TodoListClassCommand(editor));

        const listEditing = editor.plugins.get(ListEditing);
        listEditing.registerDowncastStrategy({
            scope: "item",
            attributeName: TODO_LIST_CLASS_ATTRIBUTE,
            setAttributeOnDowncast(writer, value, element) {
                for (const c of TODO_LIST_CLASSES) {
                    writer.removeClass(`todo-list-${c}`, element);
                }
                if (isTodoListClass(value)) {
                    writer.addClass(`todo-list-${value}`, element);
                }
            }
        });

        editor.conversion.for("upcast").attributeToAttribute({
            view: {
                key: "class",
                value: new RegExp(`^todo-list-(${TODO_LIST_CLASSES.join("|")})$`)
            },
            model: {
                key: TODO_LIST_CLASS_ATTRIBUTE,
                value: (viewElement) => {
                    for (const c of TODO_LIST_CLASSES) {
                        if (viewElement.hasClass(`todo-list-${c}`)) {
                            return c;
                        }
                    }
                    return null;
                }
            }
        });
    }

}

class TodoListClassCommand extends Command {

    declare public value: TodoListClass | null;

    refresh() {
        const block = this._getTodoBlock();
        this.isEnabled = !!block;
        this.value = block ? ((block.getAttribute(TODO_LIST_CLASS_ATTRIBUTE) as TodoListClass) ?? null) : null;
    }

    execute(options: {className: TodoListClass | null} = {className: null}) {
        const model = this.editor.model;
        const {className} = options;
        model.change((writer) => {
            for (const block of model.document.selection.getSelectedBlocks()) {
                if (block.getAttribute("listType") !== "todo") {
                    continue;
                }
                const current = block.getAttribute(TODO_LIST_CLASS_ATTRIBUTE);
                if (className === null || current === className) {
                    writer.removeAttribute(TODO_LIST_CLASS_ATTRIBUTE, block);
                } else {
                    writer.setAttribute(TODO_LIST_CLASS_ATTRIBUTE, className, block);
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
