import { Command } from "ckeditor5";

/**
 * Inserts a new collapsible block (<details><summary>…</summary>…</details>) at the
 * current selection. The summary becomes the editable title; the body holds whatever
 * was selected (wrapped into block-level children) or a single empty paragraph if
 * the selection is collapsed. May contain any block content (including nested
 * collapsibles). After insertion the caret is placed in the empty title.
 */
export default class CollapsibleCommand extends Command {

    declare public value: boolean;

    public override refresh(): void {
        // This command is a pure insert, not a toggle — running it again inside an
        // existing collapsible would create a nested one (and re-running to "remove"
        // would lose formatting). Keep `value` false so the toolbar button never
        // shows as active.
        this.value = false;
        this.isEnabled = this._checkEnabled();
    }

    public override execute(): void {
        const editor = this.editor;
        const model = editor.model;
        const selection = model.document.selection;
        let newDetails: any;

        model.change(writer => {
            // Clone the selected content up front (does not modify the document).
            const fragment = !selection.isCollapsed ? model.getSelectedContent(selection) : null;

            const details = writer.createElement("details");
            const summary = writer.createElement("summary");
            writer.append(summary, details);

            if (fragment) {
                // Append fragment children as body content. Inline runs (e.g. text from
                // an intra-block selection) get wrapped in a paragraph so the body only
                // contains block-level children, as the schema requires.
                let pending: any[] = [];
                const flushPending = () => {
                    if (!pending.length) return;
                    const p = writer.createElement("paragraph");
                    for (const n of pending) writer.append(n, p);
                    writer.append(p, details);
                    pending = [];
                };
                for (const child of [...fragment.getChildren()]) {
                    if (child.is("element")) {
                        flushPending();
                        writer.append(child, details);
                    } else {
                        pending.push(child);
                    }
                }
                flushPending();
            }

            // Ensure the body has at least one block.
            if (details.childCount === 1) {
                writer.append(writer.createElement("paragraph"), details);
            }

            if (fragment) {
                model.deleteContent(selection);
            }
            model.insertContent(details);
            newDetails = details;

            // Place the cursor inside the summary so the user can immediately type a title.
            writer.setSelection(summary, 0);
        });

        // The editing downcast renders <details> closed by default so loaded documents
        // start collapsed. Open the freshly-inserted one so the user can type into its
        // body without an extra click. Deferred so the view has had a chance to render.
        setTimeout(() => {
            const view = editor.editing.mapper.toViewElement(newDetails);
            const dom = view ? editor.editing.view.domConverter.viewToDom(view) : null;
            if (dom instanceof HTMLDetailsElement) {
                dom.open = true;
            }
        }, 0);
    }

    private _checkEnabled(): boolean {
        const model = this.editor.model;
        const firstPosition = model.document.selection.getFirstPosition();
        if (!firstPosition) {
            return false;
        }
        return !!model.schema.findAllowedParent(firstPosition, "details");
    }
}
