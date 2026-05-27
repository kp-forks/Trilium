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

        // <details> editing downcast: emit a plain <details class="trilium-collapsible">.
        // Same as data downcast — collapsibles start collapsed on load. The insert
        // command explicitly opens the new one after insertion so the user can edit
        // the body immediately.
        conversion.for("editingDowncast").elementToElement({
            model: "details",
            view: (_modelElement, { writer }) => {
                return writer.createContainerElement("details", { class: "trilium-collapsible" });
            }
        });

        // <summary> upcast and data downcast: plain <summary>.
        conversion.for("upcast").elementToElement({ view: "summary", model: "summary" });
        conversion.for("dataDowncast").elementToElement({ model: "summary", view: "summary" });

        // <summary> editing downcast: prepend a custom arrow (CKEditor UIElement, so it's
        // excluded from the data view and not editable). Clicking it manually toggles the
        // native <details> open attribute — the only way to collapse/expand in the editor.
        conversion.for("editingDowncast").elementToElement({
            model: "summary",
            view: (_modelEl, { writer }) => {
                const summaryEl = writer.createContainerElement("summary");
                const arrowEl = writer.createUIElement("span", { class: "trilium-collapsible-arrow" }, function (domDocument) {
                    const span = this.toDomElement(domDocument);
                    // mousedown preventDefault keeps the browser from placing a caret
                    // inside the non-editable UI element.
                    span.addEventListener("mousedown", e => e.preventDefault());
                    span.addEventListener("click", e => {
                        e.stopPropagation();
                        e.preventDefault();
                        const details = span.closest("details");
                        if (details) {
                            details.open = !details.open;
                        }
                    });
                    return span;
                });
                writer.insert(writer.createPositionAt(summaryEl, 0), arrowEl);
                return summaryEl;
            }
        });

        // DOM-level keydown listeners (capture phase) for shortcuts that need to run
        // before any CKEditor observer can swallow the key. View-event listeners on
        // arrowKey/keystrokes are unreliable when the caret is inside attribute
        // elements (links, formatted text, etc.), so we listen to the raw DOM.
        editor.on("ready", () => {
            const domRoot = editor.editing.view.getDomRoot();
            if (!domRoot) {
                return;
            }

            // Ctrl+Enter (Cmd+Enter on Mac) inside a <summary> toggles the enclosing <details>.
            domRoot.addEventListener("keydown", (event: KeyboardEvent) => {
                if (event.key !== "Enter" || event.shiftKey || event.altKey) {
                    return;
                }
                if (!event.ctrlKey && !event.metaKey) {
                    return;
                }
                const summaryModel = selection.getFirstPosition()?.findAncestor("summary");
                if (!summaryModel) {
                    return;
                }
                const detailsModel = summaryModel.parent;
                if (!detailsModel?.is("element", "details")) {
                    return;
                }
                const detailsView = editor.editing.mapper.toViewElement(detailsModel);
                const detailsDom = detailsView ? editor.editing.view.domConverter.viewToDom(detailsView) : null;
                if (detailsDom instanceof HTMLDetailsElement) {
                    detailsDom.open = !detailsDom.open;
                    event.preventDefault();
                    event.stopPropagation();
                }
            }, true);

            // Down-arrow inside a <summary> jumps the caret into the first body block
            // (or skips past the whole <details> if it's collapsed). The native browser
            // behaviour is flaky when the caret is inside formatted text — this DOM-level
            // handler in capture phase fires regardless.
            domRoot.addEventListener("keydown", (event: KeyboardEvent) => {
                if (event.key !== "ArrowDown" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
                    return;
                }
                const summaryModel = selection.getFirstPosition()?.findAncestor("summary");
                if (!summaryModel) {
                    return;
                }
                const detailsModel = summaryModel.parent;
                if (!detailsModel?.is("element", "details")) {
                    return;
                }

                let target: any;
                if (!isDetailsOpen(detailsModel)) {
                    target = detailsModel.nextSibling;
                } else {
                    target = summaryModel.nextSibling;
                }
                if (!target?.is("element")) {
                    return;
                }

                editor.model.change(writer => {
                    writer.setSelection(target, 0);
                });
                event.preventDefault();
                event.stopPropagation();
            }, true);
        });

        // Suppress the native click-to-toggle on <summary> in the editor — only the
        // custom arrow above is allowed to change the open state. (The data/published
        // view keeps the native marker and click-to-toggle behavior.)
        this.listenTo(viewDocument, "click", (_evt, data: any) => {
            let node = data.target;
            while (node) {
                if (node.is?.("element", "summary") && node.parent?.is("element", "details")) {
                    data.preventDefault();
                    return;
                }
                node = node.parent;
            }
        });

        // Helper: is this <details> currently expanded in the DOM? Defaults to true
        // when no DOM mapping exists yet (e.g. during early renders).
        const isDetailsOpen = (detailsModel: any): boolean => {
            const viewEl = editor.editing.mapper.toViewElement(detailsModel);
            if (!viewEl) {
                return true;
            }
            const domEl = editor.editing.view.domConverter.viewToDom(viewEl);
            return !(domEl instanceof HTMLDetailsElement) || domEl.open;
        };

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

            if (!position.isAtStart) {
                return;
            }

            const prevSibling = block.previousSibling;
            if (!prevSibling || !prevSibling.is("element", "details")) {
                return;
            }

            // If the target details is collapsed, land on its summary (visible) instead
            // of inside the hidden body.
            const target = isDetailsOpen(prevSibling)
                ? prevSibling.getChild(prevSibling.childCount - 1)
                : prevSibling.getChild(0);
            if (!target?.is("element")) {
                return;
            }

            editor.model.change(writer => {
                writer.setSelection(target, isDetailsOpen(prevSibling) ? 0 : "end");
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

            // If the previous details is collapsed, land on its summary (visible).
            const target = isDetailsOpen(prevSibling)
                ? prevSibling.getChild(prevSibling.childCount - 1)
                : prevSibling.getChild(0);
            if (!target?.is("element")) {
                return;
            }

            editor.model.change(writer => {
                writer.setSelection(target, "end");
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

        // Selection postfixer: never let the caret rest inside a body whose enclosing
        // <details> is currently collapsed. Walk up to find the outermost closed details
        // containing the position; redirect to its summary. This catches every entry path
        // (left/right arrows, click, paste, restored selection on load, ...).
        editor.model.document.registerPostFixer(writer => {
            const position = editor.model.document.selection.getFirstPosition();
            if (!position) {
                return false;
            }

            let outermostClosed: any = null;
            for (let node: any = position.parent; node; node = node.parent) {
                if (!node.is?.("element", "details")) {
                    continue;
                }
                const viewEl = editor.editing.mapper.toViewElement(node);
                const domEl = viewEl ? editor.editing.view.domConverter.viewToDom(viewEl) : null;
                if (domEl instanceof HTMLDetailsElement && !domEl.open) {
                    outermostClosed = node;
                }
            }

            if (!outermostClosed) {
                return false;
            }

            const summary = outermostClosed.getChild(0);
            if (!summary?.is("element", "summary")) {
                return false;
            }
            // Already in this details' (visible) summary — nothing to do.
            if (position.findAncestor("summary") === summary) {
                return false;
            }

            writer.setSelection(summary, "end");
            return true;
        });
    }
}
