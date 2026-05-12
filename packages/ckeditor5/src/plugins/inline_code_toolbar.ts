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

        // Show/hide after the UI has fully updated (selection, commands, DOM
        // are all settled), so the code command's value and native selection
        // are both current.
        this.listenTo(editor.ui, "update", () => {
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
        const position = editor.model.document.selection.getFirstPosition();

        // Don't show for code blocks (they have their own toolbar)
        if (position?.findAncestor("codeBlock")) {
            this.hideToolbar();
            return;
        }

        // Use the code command's value — it reliably reflects whether the
        // cursor is inside inline code, including at boundary positions.
        const codeCommand = editor.commands.get("code");
        if (codeCommand?.value) {
            this.showToolbar();
        } else {
            this.hideToolbar();
        }
    }

    private showToolbar() {
        if (!this.balloon) return;

        // Find the <code> DOM element from the native selection
        const domSelection = window.getSelection();
        const anchorNode = domSelection?.anchorNode;
        if (!anchorNode) {
            this.hideToolbar();
            return;
        }

        const domElement = (anchorNode instanceof HTMLElement ? anchorNode : anchorNode.parentElement)?.closest("code");
        if (!domElement) {
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
