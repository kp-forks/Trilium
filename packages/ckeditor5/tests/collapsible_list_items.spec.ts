import { _setModelData as setModelData, ClassicEditor, List, Paragraph, Typing, Undo, type ModelElement } from "ckeditor5";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import CollapsibleListItems, { LIST_COLLAPSED_ATTRIBUTE } from "../src/plugins/collapsible_list_items.js";

// Lists are flat in the model: sibling blocks related by listIndent/listItemId.
const LIST_FIXTURE =
    '<paragraph listIndent="0" listItemId="i-a" listType="bulleted">Parent[]</paragraph>' +
    '<paragraph listIndent="1" listItemId="i-b" listType="bulleted">Child</paragraph>' +
    '<paragraph listIndent="1" listItemId="i-c" listType="bulleted">Other child</paragraph>' +
    '<paragraph listIndent="0" listItemId="i-d" listType="bulleted">Sibling</paragraph>' +
    "<paragraph>Outside of the list</paragraph>";

describe("CollapsibleListItems", () => {
    let editorElement: HTMLDivElement;
    let editor: ClassicEditor;

    beforeEach(async () => {
        editorElement = document.createElement("div");
        document.body.appendChild(editorElement);

        editor = await ClassicEditor.create(editorElement, {
            plugins: [CollapsibleListItems, List, Paragraph, Typing, Undo],
            licenseKey: "GPL"
        });

        setModelData(editor.model, LIST_FIXTURE);
    });

    afterEach(async () => {
        editorElement.remove();
        await editor.destroy();
    });

    it("collapses and expands via the command and persists the state into the data", () => {
        const dataBefore = editor.getData();
        const command = editor.commands.get("toggleListCollapse");
        expect(command?.isEnabled).toBe(true);

        editor.execute("toggleListCollapse");

        expect(getBlock(editor, 0).getAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(true);
        expect(command?.value).toBe(true);

        const domRoot = editor.editing.view.getDomRoot();
        const collapsedItem = domRoot?.querySelector('li[data-trilium-collapsed="true"]');
        expect(collapsedItem).not.toBeNull();
        const nestedList = collapsedItem?.querySelector("ul");
        expect(nestedList).not.toBeNull();
        if (nestedList) {
            expect(getComputedStyle(nestedList).display).toBe("none");
        }

        expect(editor.getData()).toContain('data-trilium-collapsed="true"');

        editor.execute("toggleListCollapse");
        expect(getBlock(editor, 0).hasAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(false);
        expect(command?.value).toBe(false);
        expect(domRoot?.querySelector("li[data-trilium-collapsed]")).toBeNull();
        expect(editor.getData()).toBe(dataBefore);
    });

    it("round-trips the collapsed state through the data without expanding it on load", () => {
        editor.setData(
            '<ul><li data-trilium-collapsed="true">Parent<ul><li>Child</li></ul></li><li>Sibling</li></ul>');

        // Loading a collapsed subtree must not trigger the "content placed under a
        // collapsed parent" auto-expansion: the children arrive together with the parent.
        expect(getBlock(editor, 0).getAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(true);

        const domRoot = editor.editing.view.getDomRoot();
        const nestedList = domRoot?.querySelector('li[data-trilium-collapsed="true"] ul');
        expect(nestedList).not.toBeNull();
        if (nestedList) {
            expect(getComputedStyle(nestedList).display).toBe("none");
        }

        expect(editor.getData()).toContain('data-trilium-collapsed="true"');
    });

    it("normalizes away persisted state that has nothing to collapse", () => {
        editor.setData('<ul><li data-trilium-collapsed="true">No children</li></ul>');

        expect(getBlock(editor, 0).hasAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(false);
        expect(editor.getData()).not.toContain("data-trilium-collapsed");
    });

    it("collapse toggles are undoable", () => {
        const dataBefore = editor.getData();

        editor.execute("toggleListCollapse");
        expect(getBlock(editor, 0).getAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(true);

        editor.execute("undo");
        expect(getBlock(editor, 0).hasAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(false);
        expect(editor.getData()).toBe(dataBefore);
    });

    it("is only enabled on list items that have nested items", () => {
        const command = editor.commands.get("toggleListCollapse");

        setSelectionIn(editor, 1); // leaf child
        expect(command?.isEnabled).toBe(false);

        setSelectionIn(editor, 4); // outside of the list
        expect(command?.isEnabled).toBe(false);
    });

    it("applies to every block of a multi-block list item", () => {
        setModelData(editor.model,
            '<paragraph listIndent="0" listItemId="i-a" listType="bulleted">First[]</paragraph>' +
            '<paragraph listIndent="0" listItemId="i-a" listType="bulleted">Second</paragraph>' +
            '<paragraph listIndent="1" listItemId="i-b" listType="bulleted">Child</paragraph>');

        editor.execute("toggleListCollapse");
        expect(getBlock(editor, 0).getAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(true);
        expect(getBlock(editor, 1).getAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(true);

        editor.execute("toggleListCollapse");
        expect(getBlock(editor, 0).hasAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(false);
        expect(getBlock(editor, 1).hasAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(false);
    });

    it("expands automatically when the selection moves into a hidden item", () => {
        editor.execute("toggleListCollapse");
        expect(getBlock(editor, 0).getAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(true);

        setSelectionIn(editor, 1);

        expect(getBlock(editor, 0).hasAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(false);
        expect(editor.getData()).not.toContain("data-trilium-collapsed");
    });

    it("expands automatically when an item is indented under a collapsed parent", () => {
        editor.execute("toggleListCollapse");
        setSelectionIn(editor, 3); // "Sibling", still visible at indent 0

        expect(getBlock(editor, 0).getAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(true);

        editor.execute("indentList");

        expect(getBlock(editor, 3).getAttribute("listIndent")).toBe(1);
        expect(getBlock(editor, 0).hasAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(false);
    });

    it("drops the collapsed attribute from new items that have nothing to collapse", () => {
        // Simulates e.g. an Enter split copying the attribute onto the new block.
        editor.model.change((writer) => {
            const root = editor.model.document.getRoot();
            if (!root) {
                throw new Error("The editor has no root.");
            }
            const block = writer.createElement("paragraph", {
                listIndent: 0,
                listItemId: "i-z",
                listType: "bulleted",
                [LIST_COLLAPSED_ATTRIBUTE]: true
            });
            writer.insert(block, root, "end");
        });

        expect(getBlock(editor, 5).hasAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(false);
    });

    it("toggles when clicking the arrow in the gutter and ignores other clicks", () => {
        const domRoot = editor.editing.view.getDomRoot();
        const items = domRoot ? Array.from(domRoot.querySelectorAll("li")) : [];
        const parentItem = items.at(0);
        const leafItem = items.at(1);
        expect(parentItem).toBeDefined();
        expect(leafItem).toBeDefined();
        if (!parentItem || !leafItem) {
            return;
        }

        mouseDownAt(parentItem, -10); // on the gutter arrow
        expect(getBlock(editor, 0).getAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(true);

        mouseDownAt(parentItem, -10); // toggles back
        expect(getBlock(editor, 0).hasAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(false);

        mouseDownAt(parentItem, 5); // inside the item box: not a gutter click
        expect(getBlock(editor, 0).hasAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(false);

        mouseDownAt(leafItem, -10); // leaf items have nothing to collapse
        expect(getBlock(editor, 1).hasAttribute(LIST_COLLAPSED_ATTRIBUTE)).toBe(false);
    });
});

function getBlock(editor: ClassicEditor, index: number): ModelElement {
    const child = editor.model.document.getRoot()?.getChild(index);
    if (!child || !child.is("element")) {
        throw new Error(`No element block at index ${index}.`);
    }
    return child;
}

function setSelectionIn(editor: ClassicEditor, blockIndex: number): void {
    editor.model.change((writer) => {
        writer.setSelection(writer.createPositionAt(getBlock(editor, blockIndex), 0));
    });
}

function mouseDownAt(item: HTMLElement, offsetX: number): void {
    const rect = item.getBoundingClientRect();
    item.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + offsetX,
        clientY: rect.top + 5
    }));
}
