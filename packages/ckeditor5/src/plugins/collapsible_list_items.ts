import "../theme/collapsible_list_items.css";

import { AttributeOperation, Command, ListEditing, MouseObserver, Plugin, type Batch, type Editor, type ModelElement, type ModelNode, type ModelWriter, type ViewDocumentMouseDownEvent, type ViewElement } from "ckeditor5";

export const LIST_COLLAPSED_ATTRIBUTE = "listCollapsed";

const COLLAPSED_CLASS = "tn-list-collapsed";

/**
 * Allows collapsing/expanding nested list items, similar to outliners such as Dynalist or Roam.
 *
 * The collapsed state is kept as a `listCollapsed` model attribute that is rendered only on the
 * editing pipeline (as the `tn-list-collapsed` class on the `<li>`), so it is never written into
 * the saved note content and does not survive a reload. Toggling it must therefore not mark the
 * note as modified — collapse-only batches are filtered out via {@link isListCollapseToggleBatch}.
 */
export default class CollapsibleListItems extends Plugin {

    static get requires() {
        return [ListEditing] as const;
    }

    init() {
        const editor = this.editor;

        editor.model.schema.extend("$block", {allowAttributes: LIST_COLLAPSED_ATTRIBUTE});

        editor.commands.add("toggleListCollapse", new ToggleListCollapseCommand(editor));

        editor.plugins.get(ListEditing).registerDowncastStrategy({
            scope: "item",
            attributeName: LIST_COLLAPSED_ATTRIBUTE,
            setAttributeOnDowncast(writer, value, element, options) {
                // Editing pipeline only — the collapsed state is never saved into the content.
                if (value && !options?.dataPipeline) {
                    writer.addClass(COLLAPSED_CLASS, element);
                } else {
                    writer.removeClass(COLLAPSED_CLASS, element);
                }
            }
        });

        this._enableToggleOnGutterClick();
        this._enableAutoExpand();
    }

    /**
     * Toggles the collapsed state when the arrow rendered in the gutter next to a list item is
     * clicked. The arrow is the item's `::before` pseudo-element placed outside its border box,
     * so a mouse event left of the `<li>` box that still targets the `<li>` is an arrow click.
     */
    private _enableToggleOnGutterClick() {
        const editor = this.editor;
        const view = editor.editing.view;

        view.addObserver(MouseObserver);

        this.listenTo<ViewDocumentMouseDownEvent>(view.document, "mousedown", (evt, data) => {
            const viewItem = data.target;
            if (!viewItem || !viewItem.is("element", "li")) {
                return;
            }

            const domItem = data.domTarget as HTMLElement;
            const rect = domItem.getBoundingClientRect();
            const isRtl = domItem.ownerDocument.defaultView?.getComputedStyle(domItem).direction === "rtl";
            const isGutterClick = isRtl ? data.domEvent.clientX > rect.right : data.domEvent.clientX < rect.left;
            if (!isGutterClick) {
                return;
            }

            const block = getListBlockFromViewListItem(editor, viewItem);
            if (!block || !hasNestedItems(block)) {
                return;
            }

            // Keep the caret where it is instead of moving it to the clicked item.
            data.preventDefault();
            evt.stop();
            toggleCollapsed(editor, block);
        });
    }

    /**
     * Expands collapsed ancestors whenever content would otherwise become (or stay) invisible:
     * when the selection lands inside a hidden block (arrow keys, find & replace, a backspace
     * merge) and when blocks are placed under a collapsed parent (indent, paste, move).
     */
    private _enableAutoExpand() {
        const editor = this.editor;
        const model = editor.model;

        this.listenTo(model.document.selection, "change:range", () => {
            const block = model.document.selection.getFirstPosition()?.parent;
            if (!block || !block.is("element") || !block.hasAttribute("listItemId")) {
                return;
            }

            const collapsedAncestors = getCollapsedAncestors(block);
            if (collapsedAncestors.length === 0) {
                return;
            }

            model.enqueueChange({isUndoable: false}, (writer) => {
                for (const ancestor of collapsedAncestors) {
                    expandItem(writer, ancestor);
                }
            });
        });

        model.document.registerPostFixer((writer) => {
            const changedBlocks = new Set<ModelElement>();

            for (const entry of model.document.differ.getChanges()) {
                let node: ModelNode | null = null;
                if (entry.type === "insert") {
                    node = entry.position.nodeAfter;
                } else if (entry.type === "attribute" && (entry.attributeKey === "listIndent" || entry.attributeKey === "listItemId")) {
                    node = entry.range.start.nodeAfter;
                }
                if (node && node.is("element") && node.hasAttribute("listItemId")) {
                    changedBlocks.add(node);
                }
            }

            let changed = false;
            for (const block of changedBlocks) {
                for (const ancestor of getCollapsedAncestors(block)) {
                    expandItem(writer, ancestor);
                    changed = true;
                }
                // Splitting a collapsed item (e.g. pressing Enter) copies the attribute onto the
                // new block; drop it again when the new item has nothing to collapse.
                if (block.getAttribute(LIST_COLLAPSED_ATTRIBUTE) && !hasNestedItems(block)) {
                    writer.removeAttribute(LIST_COLLAPSED_ATTRIBUTE, block);
                    changed = true;
                }
            }

            return changed;
        });
    }

}

/**
 * Toggles the collapsed state of the list item under the selection. Exposed as
 * `toggleListCollapse` for keyboard shortcuts and scripting.
 */
export class ToggleListCollapseCommand extends Command {

    declare public value: boolean;

    refresh() {
        const block = getSelectedListBlock(this.editor);
        this.isEnabled = !!block && hasNestedItems(block);
        this.value = !!block?.getAttribute(LIST_COLLAPSED_ATTRIBUTE);
    }

    execute() {
        const block = getSelectedListBlock(this.editor);
        if (block && hasNestedItems(block)) {
            toggleCollapsed(this.editor, block);
        }
    }

}

/**
 * Whether the batch consists solely of collapse/expand toggles. Such batches do not affect the
 * saved content (the attribute has no data downcast), so content-save listeners on `change:data`
 * should ignore them.
 */
export function isListCollapseToggleBatch(batch: Batch): boolean {
    return batch.operations.length > 0
        && batch.operations.every((operation) => operation instanceof AttributeOperation && operation.key === LIST_COLLAPSED_ATTRIBUTE);
}

function toggleCollapsed(editor: Editor, block: ModelElement): void {
    const collapse = !block.getAttribute(LIST_COLLAPSED_ATTRIBUTE);

    // Not undoable: the state is view-only, an undo step would be invisible in the content.
    editor.model.enqueueChange({isUndoable: false}, (writer) => {
        for (const itemBlock of getItemBlocks(block)) {
            if (collapse) {
                writer.setAttribute(LIST_COLLAPSED_ATTRIBUTE, true, itemBlock);
            } else {
                writer.removeAttribute(LIST_COLLAPSED_ATTRIBUTE, itemBlock);
            }
        }
    });
}

function expandItem(writer: ModelWriter, block: ModelElement): void {
    for (const itemBlock of getItemBlocks(block)) {
        writer.removeAttribute(LIST_COLLAPSED_ATTRIBUTE, itemBlock);
    }
}

function getSelectedListBlock(editor: Editor): ModelElement | null {
    const parent = editor.model.document.selection.getFirstPosition()?.parent;
    if (parent && parent.is("element") && parent.hasAttribute("listItemId")) {
        return parent;
    }
    return null;
}

/**
 * Maps the view `<li>` back to the first model block of the list item. The model keeps lists
 * flat (sibling blocks with `listIndent`/`listItemId` attributes), so mapping a view position at
 * the start of the `<li>` yields a model position directly before the item's first block.
 */
function getListBlockFromViewListItem(editor: Editor, viewItem: ViewElement): ModelElement | null {
    const viewPosition = editor.editing.view.createPositionAt(viewItem, 0);
    const block = editor.editing.mapper.toModelPosition(viewPosition).nodeAfter;
    if (block && block.is("element") && block.hasAttribute("listItemId")) {
        return block;
    }
    return null;
}

/** Whether the list item has nested (deeper-indented) items, i.e. there is anything to collapse. */
function hasNestedItems(block: ModelElement): boolean {
    const itemId = block.getAttribute("listItemId");
    for (let sibling = block.nextSibling; isListBlock(sibling); sibling = sibling.nextSibling) {
        if (sibling.getAttribute("listItemId") !== itemId) {
            return getIndent(sibling) > getIndent(block);
        }
    }
    return false;
}

/** All consecutive blocks belonging to the same (possibly multi-block) list item. */
function getItemBlocks(block: ModelElement): ModelElement[] {
    const itemId = block.getAttribute("listItemId");
    const blocks = [block];
    for (let prev = block.previousSibling; isListBlock(prev) && prev.getAttribute("listItemId") === itemId; prev = prev.previousSibling) {
        blocks.unshift(prev);
    }
    for (let next = block.nextSibling; isListBlock(next) && next.getAttribute("listItemId") === itemId; next = next.nextSibling) {
        blocks.push(next);
    }
    return blocks;
}

/**
 * The collapsed ancestor items hiding this block, outermost last. Ancestors are the preceding
 * sibling blocks with a lower indent than any block in between.
 */
function getCollapsedAncestors(block: ModelElement): ModelElement[] {
    const ancestors: ModelElement[] = [];
    let minIndent = getIndent(block);

    for (let prev = block.previousSibling; isListBlock(prev) && minIndent > 0; prev = prev.previousSibling) {
        const indent = getIndent(prev);
        if (indent >= minIndent) {
            continue;
        }
        minIndent = indent;
        if (prev.getAttribute(LIST_COLLAPSED_ATTRIBUTE)) {
            ancestors.push(prev);
        }
    }

    return ancestors;
}

function isListBlock(node: ModelNode | null): node is ModelElement {
    return !!node && node.is("element") && node.hasAttribute("listItemId");
}

function getIndent(block: ModelElement): number {
    const indent = block.getAttribute("listIndent");
    return typeof indent === "number" ? indent : 0;
}
