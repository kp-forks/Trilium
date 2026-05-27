import { Plugin, Enter, Delete, type ViewDocumentEnterEvent, type ViewDocumentDeleteEvent, type ViewDocumentArrowKeyEvent } from "ckeditor5";
import CollapsibleCommand from "./collapsiblecommand.js";

/**
 * Defines the schema, conversion and basic key handling for collapsible blocks.
 *
 * Model:
 *   <details>
 *       <summary>title text</summary>
 *       …any block content (including nested <details>)…
 *   </details>
 *
 * Data view (output HTML):  <details class="trilium-collapsible"><summary>…</summary>…</details>
 * Editing view: same, but with `open` attribute so the body is always visible while editing.
 */
export default class CollapsibleEditing extends Plugin {

    public static get pluginName() {
        return "CollapsibleEditing" as const;
    }

    public static get requires() {
        return [Enter, Delete] as const;
    }

    public init(): void {
        const editor = this.editor;
        const schema = editor.model.schema;
        const conversion = editor.conversion;
        const viewDocument = editor.editing.view.document;
        const selection = editor.model.document.selection;

        editor.commands.add("collapsible", new CollapsibleCommand(editor));

        // Schema --------------------------------------------------------------

        schema.register("details", {
            inheritAllFrom: "$container"
        });

        schema.register("summary", {
            allowIn: "details",
            allowContentOf: "$block"
        });

        // Conversion ----------------------------------------------------------

        // <details> upcast: accept any <details>, ignore the `open` attribute.
        conversion.for("upcast").elementToElement({
            view: "details",
            model: "details"
        });

        // <details> data downcast: emit a plain <details class="trilium-collapsible">.
        conversion.for("dataDowncast").elementToElement({
            model: "details",
            view: (_modelElement, { writer }) => {
                return writer.createContainerElement("details", { class: "trilium-collapsible" });
            }
        });

        // <details> editing downcast: force `open` so the user can edit the body.
        conversion.for("editingDowncast").elementToElement({
            model: "details",
            view: (_modelElement, { writer }) => {
                return writer.createContainerElement("details", {
                    class: "trilium-collapsible",
                    open: "open"
                });
            }
        });

        // <summary> conversion (same in both pipelines).
        conversion.for("upcast").elementToElement({ view: "summary", model: "summary" });
        conversion.for("downcast").elementToElement({ model: "summary", view: "summary" });

        // UX: allow up-arrow to move cursor into the last block of a collapsible from below.
        this.listenTo<ViewDocumentArrowKeyEvent>(viewDocument, "arrowKey", (evt, data) => {
            if (data.keyCode !== 38 || data.shiftKey || !selection.isCollapsed) {
                return;
            }

            const position = selection.getFirstPosition();
            if (!position) {
                return;
            }

            const block = position.parent;
            if (!block || !block.is("element")) {
                return;
            }

            // If we're at the start of a block, check if the previous sibling is a <details>.
            if (!position.isAtStart) {
                return;
            }

            const prevSibling = block.previousSibling;
            if (!prevSibling || !prevSibling.is("element", "details")) {
                return;
            }

            // Move cursor to the last child of the details.
            editor.model.change(writer => {
                const lastChild = prevSibling.getChild(prevSibling.childCount - 1);
                if (lastChild && lastChild.is("element")) {
                    writer.setSelection(lastChild, 0);
                }
            });

            data.preventDefault();
            evt.stop();
        });

        // UX: up-arrow inside a <summary> when the previous sibling is also a <details>
        // jumps into the last body block of the previous one. (Native arrow nav skips
        // over stacked <details> blocks.)
        this.listenTo<ViewDocumentArrowKeyEvent>(viewDocument, "arrowKey", (evt, data) => {
            if (data.keyCode !== 38 || data.shiftKey || !selection.isCollapsed) {
                return;
            }

            const summary = selection.getFirstPosition()?.findAncestor("summary");
            if (!summary) {
                return;
            }

            const details = summary.parent;
            if (!details?.is("element", "details")) {
                return;
            }

            const prevSibling = details.previousSibling;
            if (!prevSibling?.is("element", "details")) {
                return;
            }

            const lastBlock = prevSibling.getChild(prevSibling.childCount - 1);
            if (!lastBlock?.is("element")) {
                return;
            }

            editor.model.change(writer => {
                writer.setSelection(lastBlock, "end");
            });

            data.preventDefault();
            evt.stop();
        });

        // UX: down-arrow inside a <summary> moves the caret into the first body block.
        // (Native browser arrow navigation in <summary> is unreliable.)
        this.listenTo<ViewDocumentArrowKeyEvent>(viewDocument, "arrowKey", (evt, data) => {
            if (data.keyCode !== 40 || data.shiftKey || !selection.isCollapsed) {
                return;
            }

            const summary = selection.getFirstPosition()?.findAncestor("summary");
            if (!summary) {
                return;
            }

            const firstBodyBlock = summary.nextSibling;
            if (!firstBodyBlock || !firstBodyBlock.is("element")) {
                return;
            }

            editor.model.change(writer => {
                writer.setSelection(firstBodyBlock, 0);
            });

            data.preventDefault();
            evt.stop();
        });

        // When the user collapses a <details> in the editor, make sure the caret isn't
        // left stranded inside the now-hidden body — move it to the summary instead.
        // (toggle does not bubble, so attach in capture phase.)
        editor.on("ready", () => {
            const domRoot = editor.editing.view.getDomRoot();
            if (!domRoot) {
                return;
            }
            domRoot.addEventListener("toggle", (event: Event) => {
                const detailsDom = event.target as HTMLDetailsElement;
                if (detailsDom.tagName?.toLowerCase() !== "details" || detailsDom.open) {
                    return;
                }
                const detailsView = editor.editing.view.domConverter.mapDomToView(detailsDom);
                if (!detailsView) {
                    return;
                }
                const detailsModel = editor.editing.mapper.toModelElement(detailsView as any);
                if (!detailsModel) {
                    return;
                }
                const position = editor.model.document.selection.getFirstPosition();
                if (!position || position.findAncestor("summary") || !position.findAncestor("details")) {
                    return;
                }
                if (position.findAncestor("details") !== detailsModel) {
                    return;
                }
                const summary = detailsModel.getChild(0);
                if (summary?.is("element", "summary")) {
                    editor.model.change(writer => {
                        writer.setSelection(summary, "end");
                    });
                }
            }, true);
        });

        // UX: pressing Enter inside an empty summary moves the cursor into the body.

        this.listenTo<ViewDocumentEnterEvent>(viewDocument, "enter", (evt, data) => {
            if (!selection.isCollapsed) {
                return;
            }

            const position = selection.getLastPosition();
            const summary = position?.findAncestor("summary");
            if (!summary) {
                return;
            }

            // Titles are single-line: always swallow Enter so it never inserts a newline
            // or splits the summary.
            data.preventDefault();
            evt.stop();

            // Only jump into the body when Enter is pressed at the very end of the title.
            // At the start or middle, do nothing — moving the cursor would surprise the user.
            if (!position!.isAtEnd) {
                return;
            }

            const details = summary.parent;
            if (!details || !details.is("element", "details")) {
                return;
            }

            const firstBodyBlock = summary.nextSibling;
            if (firstBodyBlock && firstBodyBlock.is("element")) {
                editor.model.change(writer => {
                    writer.setSelection(firstBodyBlock, 0);
                });
            }
        }, { context: "summary" });

        // UX: pressing Enter inside an empty trailing paragraph of the body exits the
        // collapsible (text + Enter + Enter → out — same convention as blockquote).
        this.listenTo<ViewDocumentEnterEvent>(viewDocument, "enter", (evt, data) => {
            if (!selection.isCollapsed) {
                return;
            }

            const positionParent = selection.getLastPosition()?.parent;
            if (!positionParent || !positionParent.is("element") || positionParent.is("element", "summary")) {
                return;
            }
            if (!positionParent.isEmpty || positionParent.nextSibling) {
                return;
            }

            const details = positionParent.parent;
            if (!details || !details.is("element", "details")) {
                return;
            }

            data.preventDefault();
            evt.stop();

            editor.model.change(writer => {
                writer.remove(positionParent);
                const after = details.nextSibling;
                if (after && after.is("element", "paragraph")) {
                    writer.setSelection(after, 0);
                } else {
                    const newParagraph = writer.createElement("paragraph");
                    writer.insert(newParagraph, writer.createPositionAfter(details));
                    writer.setSelection(newParagraph, 0);
                }
            });
        });

        // UX: explicitly handle deletion of <details> blocks to prevent orphaned structure.
        this.listenTo<ViewDocumentDeleteEvent>(viewDocument, "delete", (evt, data) => {
            if (!selection.isCollapsed) {
                return;
            }

            const position = selection.getFirstPosition();
            if (!position) {
                return;
            }

            // Deleting forward: check if we're about to delete a <details> block.
            if (data.direction === "forward") {
                const nextNode = position.nodeAfter;
                if (nextNode && nextNode.is("element", "details")) {
                    editor.model.change(writer => {
                        writer.remove(nextNode);
                    });
                    data.preventDefault();
                    evt.stop();
                    return;
                }
            }

            // Deleting backward: check if we're right after a <details> block.
            if (data.direction === "backward") {
                const prevNode = position.nodeBefore;
                if (prevNode && prevNode.is("element", "details")) {
                    editor.model.change(writer => {
                        writer.remove(prevNode);
                    });
                    data.preventDefault();
                    evt.stop();
                    return;
                }
            }
        });

        // UX: backspace at the start of an empty summary unwraps the collapsible.
        this.listenTo<ViewDocumentDeleteEvent>(viewDocument, "delete", (evt, data) => {
            if (data.direction !== "backward" || !selection.isCollapsed) {
                return;
            }

            const position = selection.getLastPosition();
            const summary = position?.findAncestor("summary");
            if (!summary || !summary.isEmpty) {
                return;
            }

            const details = summary.parent;
            if (!details || !details.is("element", "details")) {
                return;
            }

            data.preventDefault();
            evt.stop();

            editor.model.change(writer => {
                writer.unwrap(details);
            });
        }, { context: "summary" });

        // Postfixer: remove orphaned elements and clean up invalid structure.
        editor.model.document.registerPostFixer(writer => {
            const changes = editor.model.document.differ.getChanges();
            let changed = false;

            for (const entry of changes) {
                if (entry.type !== "remove" && entry.type !== "insert") {
                    continue;
                }

                const node = entry.position.nodeAfter || entry.position.nodeBefore;
                if (!node || !node.is("element")) {
                    continue;
                }

                // Walk up and check: if this is a summary not inside details, remove it.
                let current: any = node;
                while (current) {
                    if (current.is("element", "summary")) {
                        const parent = current.parent;
                        if (!parent || !parent.is("element", "details")) {
                            writer.remove(current);
                            changed = true;
                        }
                        break;
                    }
                    current = current.parent;
                }

                // Remove empty <details> elements.
                if (node.is("element", "details") && node.isEmpty) {
                    writer.remove(node);
                    changed = true;
                    continue;
                }

                // Clean up empty list items.
                if (node.is("element", "listItem") && node.isEmpty) {
                    writer.remove(node);
                    changed = true;
                }
            }

            return changed;
        });

        // Selection postfixer: don't let the caret sit in the "gap" between <summary>
        // and a body block — push it into the nearest block instead.
        editor.model.document.registerPostFixer(writer => {
            const position = editor.model.document.selection.getFirstPosition();
            if (!position || !position.parent.is("element", "details")) {
                return false;
            }
            const details = position.parent;
            const after = details.getChild(position.offset);
            const before = position.offset > 0 ? details.getChild(position.offset - 1) : null;
            // Prefer the previous block — when the details is collapsed, the body is
            // hidden, so landing at end-of-summary keeps the caret visible.
            if (before && before.is("element")) {
                writer.setSelection(before, "end");
            } else if (after && after.is("element")) {
                writer.setSelection(after, 0);
            } else {
                return false;
            }
            return true;
        });
    }
}
