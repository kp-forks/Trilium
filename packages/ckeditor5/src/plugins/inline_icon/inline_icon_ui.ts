import { ButtonView, Plugin } from "ckeditor5";

import insertIconIcon from "../../icons/insert-icon.svg?raw";
import { INSERT_ICON_COMMAND } from "./inline_icon_editing.js";

/**
 * The button an icon is inserted through. Picking the icon is left to the host, which already has
 * a picker over every installed icon pack; it answers by running {@link INSERT_ICON_COMMAND}.
 */
export default class InlineIconUI extends Plugin {

    public static get pluginName() {
        return "InlineIconUI" as const;
    }

    init() {
        const editor = this.editor;
        const t = editor.t;

        editor.ui.componentFactory.add(INSERT_ICON_COMMAND, (locale) => {
            const command = editor.commands.get(INSERT_ICON_COMMAND);
            const view = new ButtonView(locale);

            view.set({
                label: t("Insert icon"),
                icon: insertIconIcon,
                tooltip: true
            });

            if (command) {
                view.bind("isEnabled").to(command, "isEnabled");
            }

            this.listenTo(view, "execute", () => {
                const editorEl = editor.editing.view.getDomRoot();
                if (!editorEl) {
                    return;
                }

                glob.getComponentByEl(editorEl).triggerCommand("insertIconToText");
            });

            return view;
        });
    }

}
