import { Plugin, WidgetToolbarRepository, isWidget, type ViewElement } from "ckeditor5";
import IncludeNote from "./includenote.js";
import IncludeNoteBoxSizeDropdown from "./include_note_box_size_dropdown.js";

export default class IncludeNoteToolbar extends Plugin {

    static get requires() {
        return [WidgetToolbarRepository, IncludeNote, IncludeNoteBoxSizeDropdown] as const;
    }

    afterInit() {
        const editor = this.editor;
        const widgetToolbarRepository = editor.plugins.get(WidgetToolbarRepository);

        console.log("[IncludeNoteToolbar] Registering toolbar");

        widgetToolbarRepository.register("includeNote", {
            items: [
                "includeNoteBoxSizeDropdown"
            ],
            balloonClassName: "ck-toolbar-container include-note-toolbar",
            getRelatedElement(selection) {
                const selectedElement = selection.getSelectedElement();
                console.log("[IncludeNoteToolbar] getRelatedElement called, selectedElement:", selectedElement);

                if (selectedElement) {
                    console.log("[IncludeNoteToolbar] Element name:", selectedElement.name);
                    console.log("[IncludeNoteToolbar] Element classes:", selectedElement.getAttribute("class"));
                    console.log("[IncludeNoteToolbar] isWidget:", isWidget(selectedElement));
                }

                if (selectedElement && isIncludeNoteWidget(selectedElement)) {
                    console.log("[IncludeNoteToolbar] Found include note widget, returning element");
                    return selectedElement;
                }

                console.log("[IncludeNoteToolbar] No include note widget found");
                return null;
            }
        });
    }

}

function isIncludeNoteWidget(element: ViewElement): boolean {
    if (!isWidget(element)) {
        return false;
    }

    if (!element.is("element", "section")) {
        return false;
    }

    const classes = element.getAttribute("class") || "";
    return typeof classes === "string" && classes.includes("include-note");
}
