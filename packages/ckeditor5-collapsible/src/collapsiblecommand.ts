import { Command } from "ckeditor5";

/**
 * Inserts a new collapsible block (<details><summary>…</summary>…</details>) at the
 * current selection. The summary becomes the editable title; the body holds a single
 * empty paragraph by default and may contain any block content (including nested
 * collapsibles).
 */
export default class CollapsibleCommand extends Command {

    declare public value: boolean;

    public override refresh(): void {
        const selection = this.editor.model.document.selection;
        const block = selection.getFirstPosition()?.findAncestor("details");
        this.value = !!block;
        this.isEnabled = this._checkEnabled();
    }

    public override execute(): void {
        const editor = this.editor;
        const model = editor.model;
        let newDetails: any;

        model.change(writer => {
            const detailsEl = writer.createElement("details");
            const summaryEl = writer.createElement("summary");
            const paragraphEl = writer.createElement("paragraph");

            writer.append(summaryEl, detailsEl);
            writer.append(paragraphEl, detailsEl);

            model.insertContent(detailsEl);
            newDetails = detailsEl;

            // Place the cursor inside the summary so the user can immediately type a title.
            writer.setSelection(summaryEl, 0);
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
