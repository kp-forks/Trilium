import { BalloonPanelView, ButtonView, Plugin, ToolbarView } from "ckeditor5";
import CopyToClipboardButton from "./copy_to_clipboard_button";
import copyIcon from "../icons/copy.svg?raw";

/**
 * Shows a small toolbar with a copy button when the cursor is on inline code.
 */
export default class InlineCodeToolbar extends Plugin {

    static get requires() {
        return [CopyToClipboardButton] as const;
    }

    private balloon?: BalloonPanelView;
    private toolbar?: ToolbarView;

    init() {
        const editor = this.editor;

        // Create toolbar with copy button
        this.toolbar = new ToolbarView(editor.locale);
        const copyButton = new ButtonView(editor.locale);
        copyButton.set({
            icon: copyIcon,
            tooltip: "Copy to clipboard"
        });
        copyButton.on("execute", () => {
            editor.execute("copyToClipboard");
            this.hideToolbar();
        });
        this.toolbar.items.add(copyButton);

        // Create balloon panel
        this.balloon = new BalloonPanelView(editor.locale);
        this.balloon.content.add(this.toolbar);
        this.balloon.class = "ck-toolbar-container";

        editor.ui.view.body.add(this.balloon);

        // Show/hide based on selection
        this.listenTo(editor.model.document.selection, "change:range", () => {
            this.updateToolbarVisibility();
        });

        // Hide on editor blur
        this.listenTo(editor.ui.focusTracker, "change:isFocused", (_evt, _name, isFocused) => {
            if (!isFocused) {
                this.hideToolbar();
            }
        });
    }

    private updateToolbarVisibility() {
        const editor = this.editor;
        const selection = editor.model.document.selection;
        const position = selection.getFirstPosition();

        // Don't show for code blocks (they have their own toolbar)
        if (position?.findAncestor("codeBlock")) {
            this.hideToolbar();
            return;
        }

        // Check if cursor is on inline code
        const textNode = position?.textNode;
        if (textNode?.hasAttribute("code")) {
            this.showToolbar();
        } else {
            this.hideToolbar();
        }
    }

    private showToolbar() {
        if (!this.balloon) return;

        const editor = this.editor;
        const view = editor.editing.view;
        const mapper = editor.editing.mapper;
        const position = editor.model.document.selection.getFirstPosition();

        if (!position) {
            this.hideToolbar();
            return;
        }

        // Map model position to view and find the <code> ancestor element
        const viewPosition = mapper.toViewPosition(position);
        const codeElement = viewPosition.getAncestors().find(
            (ancestor) => ancestor.is("attributeElement") && ancestor.name === "code"
        );

        if (!codeElement || !codeElement.is("attributeElement")) {
            this.hideToolbar();
            return;
        }

        const domElement = view.domConverter.mapViewToDom(codeElement);
        if (!domElement || !(domElement instanceof HTMLElement)) {
            this.hideToolbar();
            return;
        }

        const rect = domElement.getBoundingClientRect();
        this.balloon.pin({
            target: {
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                right: rect.right,
                width: rect.width,
                height: rect.height
            }
        });
        this.balloon.isVisible = true;
    }

    private hideToolbar() {
        if (this.balloon) {
            this.balloon.isVisible = false;
            this.balloon.unpin();
        }
    }

    override destroy() {
        super.destroy();
        if (this.balloon) {
            this.balloon.destroy();
        }
        if (this.toolbar) {
            this.toolbar.destroy();
        }
    }

}
