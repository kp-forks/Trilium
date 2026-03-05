import { DifferItemAttribute, ModelDocumentFragment, ModelElement, ModelNode } from "ckeditor5";
import { CKTextEditor } from "src";

function isHeadingElement(node: ModelElement | ModelNode | ModelDocumentFragment | null): node is ModelElement {
    return !!node
        && typeof (node as any).is === "function"
        && (node as any).is("element")
        && typeof (node as any).name === "string"
        && (node as any).name.startsWith("heading");
}

function hasHeadingAncestor(node: ModelElement | ModelNode | ModelDocumentFragment | null): boolean {
    let current: ModelElement | ModelNode | ModelDocumentFragment | null = node;
    while (current) {
        if (isHeadingElement(current)) return true;
        current = current.parent;
    }
    return false;
}

export function attributeChangeAffectsHeading(change: DifferItemAttribute, editor: CKTextEditor): boolean {
    if (change.type !== "attribute") return false;

    // Fast checks on range boundaries
    if (hasHeadingAncestor(change.range.start.parent) || hasHeadingAncestor(change.range.end.parent)) {
        return true;
    }

    // Robust check across the whole changed range
    const range = editor.model.createRange(change.range.start, change.range.end);
    for (const item of range.getItems()) {
        const baseNode = item.is("$textProxy") ? item.parent : item;
        if (hasHeadingAncestor(baseNode)) return true;
    }

    return false;
}
