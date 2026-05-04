import { Plugin, Enter, Delete, type ViewDocumentEnterEvent, type ViewDocumentDeleteEvent } from "ckeditor5";
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

        editor.commands.add("collapsible", new CollapsibleCommand(editor));

        // Schema --------------------------------------------------------------

        schema.register("details", {
            inheritAllFrom: "$container"
        });

        schema.register("summary", {
            allowIn: "details",
            allowContentOf: "$block",
            isLimit: true
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

        // UX: pressing Enter inside an empty summary moves the cursor into the body.
        const viewDocument = editor.editing.view.document;
        const selection = editor.model.document.selection;

        this.listenTo<ViewDocumentEnterEvent>(viewDocument, "enter", (evt, data) => {
            if (!selection.isCollapsed) {
                return;
            }

            const position = selection.getLastPosition();
            const summary = position?.findAncestor("summary");
            if (!summary) {
                return;
            }

            const details = summary.parent;
            if (!details || !details.is("element", "details")) {
                return;
            }

            // Always: stop the default Enter behavior inside <summary> (no newlines in titles).
            data.preventDefault();
            evt.stop();

            // Move the cursor to the start of the first body block.
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

        // Postfixer: drop entirely empty <details> elements (defensive cleanup).
        editor.model.document.registerPostFixer(writer => {
            const changes = editor.model.document.differ.getChanges();
            for (const entry of changes) {
                if (entry.type !== "remove" && entry.type !== "insert") {
                    continue;
                }
                const parent = entry.position.parent;
                if (parent.is("element", "details") && parent.isEmpty) {
                    writer.remove(parent);
                    return true;
                }
            }
            return false;
        });
    }
}
