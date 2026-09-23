import bxSticker from "boxicons/svg/regular/bx-sticker.svg?raw";
import {
    ButtonView, clickOutsideHandler, type Command, ContextualBalloon, type Editor,
    KeystrokeHandler, type Locale, Plugin, View, type ViewRange
} from "ckeditor5";

import { INSERT_ICON_COMMAND } from "./inline_icon_editing.js";

/**
 * The button an icon is inserted through, and the balloon the picking happens in.
 *
 * The editor owns the balloon — where it points, when it goes away — and the application paints its
 * own picker into it through `showIconPicker`, which is the one place every installed icon pack is
 * searchable. A host with no room for a balloon shows the picker its own way and answers with
 * nothing to take down.
 */
export default class InlineIconUI extends Plugin {

    public static get pluginName() {
        return "InlineIconUI" as const;
    }

    public static get requires() {
        return [ ContextualBalloon ] as const;
    }

    private _balloon: ContextualBalloon = this.editor.plugins.get(ContextualBalloon);
    private _pickerView: IconPickerView | null = null;
    private _releasePicker: (() => void) | null = null;
    private _pickerResize: ResizeObserver | null = null;
    private _replacePicker = 0;

    init() {
        const editor = this.editor;
        const t = editor.t;

        editor.ui.componentFactory.add(INSERT_ICON_COMMAND, (locale) => {
            // Always registered: InlineIconEditing is loaded beside this plugin.
            const command = editor.commands.get(INSERT_ICON_COMMAND) as Command;
            const view = new ButtonView(locale);

            view.set({
                label: t("Insert icon"),
                icon: bxSticker,
                tooltip: true
            });

            view.bind("isEnabled").to(command, "isEnabled");

            this.listenTo(view, "execute", () => this.showPicker());

            return view;
        });

        // Esc reaches the editor only while the caret still has focus; the picker takes focus with
        // it, so the view carries a handler of its own (see {@link IconPickerView}).
        editor.keystrokes.set("Esc", (_data, cancel) => {
            if (this._pickerView) {
                this._hide();
                cancel();
            }
        });
    }

    public override destroy() {
        // Before the base class stops the listeners the balloon is taken down through.
        this._hide();
        super.destroy();
    }

    /** Opens the picker, which the `/` palette asks for as well as the toolbar button. */
    public showPicker() {
        const editor = this.editor;
        const editorEl = editor.editing.view.getDomRoot();
        const shownAt = editor.editing.view.document.selection.getFirstRange();

        if (this._pickerView || !editorEl || !shownAt) {
            return;
        }

        const view = new IconPickerView(editor.locale);
        view.keystrokes.set("Esc", (_data, cancel) => {
            this._hide();
            editor.editing.view.focus();
            cancel();
        });

        // Wired per picker rather than once: the handler listens through the view, so destroying
        // the view on the way out is what stops it listening.
        clickOutsideHandler({
            emitter: view,
            activator: () => this._pickerView === view,
            /* v8 ignore next -- the balloon renders its panel as the editor starts up */
            contextElements: this._balloon.view.element ? [ this._balloon.view.element ] : [],
            callback: () => this._hide()
        });

        this._balloon.add({ view, position: getBalloonPosition(editor, shownAt) });
        this._pickerView = view;

        const container = view.element;
        /* v8 ignore next 4 -- the balloon renders the view as it adds it, so it has an element */
        if (!container) {
            this._hide();
            return;
        }

        const release = glob.getComponentByEl<EditorComponent>(editorEl).showIconPicker({
            container,
            onSelect: (iconClass) => {
                this._hide();
                editor.execute(INSERT_ICON_COMMAND, { iconClass });
                editor.editing.view.focus();
            }
        });

        if (!release) {
            this._hide();
            return;
        }

        this._releasePicker = release;

        // The host paints into the container only once the call above has returned, and a balloon
        // placed while it is still empty puts its arrow half the picker's width away from the
        // caret. Place it again whenever what it holds changes size, which a narrowed grid needs
        // as much as the first paint does. The placing waits for the next frame: it can itself
        // change the width the container is given, and Chrome reports that as an observer loop.
        this._pickerResize = new ResizeObserver(() => {
            cancelAnimationFrame(this._replacePicker);

            this._replacePicker = requestAnimationFrame(() => {
                /* v8 ignore next -- disconnecting takes the pending frames with it */
                if (this._pickerView) {
                    this._balloon.updatePosition();
                }
            });
        });
        this._pickerResize.observe(container);
    }

    private _hide() {
        const view = this._pickerView;

        this._pickerView = null;
        this._pickerResize?.disconnect();
        this._pickerResize = null;
        cancelAnimationFrame(this._replacePicker);
        this._releasePicker?.();
        this._releasePicker = null;

        if (!view) {
            return;
        }

        /* v8 ignore next -- a picker this plugin still holds is one the balloon has */
        if (this._balloon.hasView(view)) {
            this._balloon.remove(view);
        }

        view.destroy();
    }

}

/**
 * What the balloon holds: an element for the host to paint into, and nothing else.
 *
 * It carries `ck-reset_all-excluded` because everything a balloon shows sits inside the body
 * collection's `ck-reset_all`, which would strip the application's own styling off the picker.
 */
class IconPickerView extends View {

    public readonly keystrokes = new KeystrokeHandler();

    constructor(locale: Locale) {
        super(locale);

        this.setTemplate({
            tag: "div",
            attributes: {
                class: [ "ck-reset_all-excluded", "icon-picker-balloon" ]
            }
        });
    }

    public override render() {
        super.render();

        /* v8 ignore next 3 -- `render()` is what builds the element, so it is never absent here */
        if (!this.element) {
            return;
        }

        this.keystrokes.listenTo(this.element);
    }

    public override destroy() {
        super.destroy();
        this.keystrokes.destroy();
    }

}

/** Where the balloon points: the caret, read afresh on every placing, as the emoji picker does. */
function getBalloonPosition(editor: Editor, shownAt: ViewRange) {
    const view = editor.editing.view;

    return {
        target: () => {
            /* v8 ignore next -- a rendered document always holds a range for the caret */
            const range = view.document.selection.getFirstRange() ?? shownAt;

            return view.domConverter.viewRangeToDom(range);
        }
    };
}
