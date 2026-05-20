import {
    BalloonPanelView,
    ButtonView,
    ContextualBalloon,
    DomEventObserver,
    Plugin,
    ToolbarSeparatorView,
    ToolbarView,
    clickOutsideHandler,
    type ModelElement,
    type ViewElement
} from "ckeditor5";
import { getConfiguredTaskStates } from "./todo_list_multistate_editing.js";
import TodoListMultistateUI from "./todo_list_multistate_ui.js";

class TodoCheckboxContextMenuObserver extends DomEventObserver<"contextmenu"> {
    get domEventType() {
        return "contextmenu" as const;
    }
    onDomEvent(domEvent: MouseEvent) {
        this.fire("contextmenu", domEvent);
    }
}

export default class TodoListMultistateToolbar extends Plugin {

    static get requires() {
        return [ContextualBalloon, TodoListMultistateUI] as const;
    }

    private _balloon!: ContextualBalloon;
    private _toolbarView!: ToolbarView;
    private _targetItemId: string | null = null;

    init() {
        const editor = this.editor;
        this._balloon = editor.plugins.get(ContextualBalloon);
        editor.editing.view.addObserver(TodoCheckboxContextMenuObserver);
        this._toolbarView = this._createToolbarView();

        this.listenTo(editor.editing.view.document, "contextmenu", (_evt, data) => {
            const target = (data as {target?: unknown}).target;
            if (!isTodoCheckbox(target)) {
                return;
            }
            (data as {domEvent: MouseEvent}).domEvent.preventDefault();
            this._show(target);
        });

        clickOutsideHandler({
            emitter: this._toolbarView,
            contextElements: () => (this._balloon.view.element ? [this._balloon.view.element] : []),
            callback: () => this._hide(),
            activator: () => this._isVisible()
        });

        this.listenTo(editor.model.document.selection, "change:range", () => {
            if (!this._isVisible()) {
                return;
            }
            const block = editor.model.document.selection.getFirstPosition()?.parent;
            const currentId = block && (block as ModelElement).is?.("element") ? (block as ModelElement).getAttribute("listItemId") : null;
            if (currentId !== this._targetItemId) {
                this._hide();
            }
        });
    }

    override destroy() {
        this._toolbarView?.destroy();
        super.destroy();
    }

    private _createToolbarView(): ToolbarView {
        const editor = this.editor;
        const toolbar = new ToolbarView(editor.locale);
        toolbar.class = "task-state-toolbar";
        for (const state of getConfiguredTaskStates(editor)) {
            toolbar.items.add(editor.ui.componentFactory.create(`taskState:${state.name}`));
        }
        toolbar.items.add(new ToolbarSeparatorView(editor.locale));
        toolbar.items.add(this._createEditButton());
        return toolbar;
    }

    private _createEditButton(): ButtonView {
        const editor = this.editor;
        const button = new ButtonView(editor.locale);
        const translate = (editor.config.get("translate") as ((key: string) => string) | undefined)
            ?? ((key: string) => key);
            
        button.set({
            label: translate("text-editor.edit-states-tooltip"),
            withText: false,
            tooltip: true,
            class: "ck-task-state-edit bx bx-pencil"
        });
        button.on("execute", () => {
            this._hide();
            const editTaskStates = editor.config.get("editTaskStates") as (() => void) | undefined;
            editTaskStates?.();
        });
        return button;
    }

    private _show(checkbox: ViewElement) {
        const editor = this.editor;
        const wrapper = checkbox.parent;
        if (!wrapper || !wrapper.is("element")) {
            return;
        }
        const anchorDom = editor.editing.view.domConverter.viewToDom(wrapper) as HTMLElement | null;
        if (!anchorDom) {
            return;
        }

        const block = this._findTodoBlock(checkbox);
        if (!block) {
            return;
        }
        this._targetItemId = (block.getAttribute("listItemId") as string | undefined) ?? null;
        editor.model.change((writer) => {
            writer.setSelection(writer.createPositionAt(block, 0));
        });

        const position = {
            target: anchorDom,
            positions: [
                BalloonPanelView.defaultPositions.northArrowSouth,
                BalloonPanelView.defaultPositions.southArrowNorth
            ]
        };

        if (this._isVisible()) {
            this._balloon.updatePosition(position);
        } else {
            this._balloon.add({
                view: this._toolbarView,
                position,
                balloonClassName: "ck-toolbar-container task-state-toolbar"
            });
        }
    }

    private _findTodoBlock(checkbox: ViewElement): ModelElement | null {
        const editor = this.editor;
        const li = checkbox.findAncestor("li");
        if (!li) {
            return null;
        }
        const domLi = editor.editing.view.domConverter.viewToDom(li) as HTMLElement | null;
        const itemId = domLi?.getAttribute("data-list-item-id");
        if (!itemId) {
            return null;
        }
        const root = editor.model.document.getRoot();
        if (!root) {
            return null;
        }
        for (const item of editor.model.createRangeIn(root).getItems()) {
            if (item.is("element")
                && item.getAttribute("listItemId") === itemId
                && item.getAttribute("listType") === "todo") {
                return item as ModelElement;
            }
        }
        return null;
    }

    private _hide() {
        if (this._isVisible()) {
            this._balloon.remove(this._toolbarView);
        }
        this._targetItemId = null;
    }

    private _isVisible(): boolean {
        return this._balloon.hasView(this._toolbarView);
    }

}

function isTodoCheckbox(el: unknown): el is ViewElement {
    if (!el || typeof (el as ViewElement).is !== "function") {
        return false;
    }
    const v = el as ViewElement;
    if (!v.is("element", "input")) {
        return false;
    }
    if (v.getAttribute("type") !== "checkbox") {
        return false;
    }
    return !!v.findAncestor({classes: "todo-list__label"});
}
