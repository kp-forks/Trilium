import {
    Command, ModelElement, type ModelWriter, Plugin, toWidget, type ViewElement, Widget
} from "ckeditor5";

/** The model element an icon is; it draws whatever {@link ICON_CLASS} names. */
const ICON = "inlineIcon";

/** The icon pack's own class, such as `bx bx-star`. */
const ICON_CLASS = "iconClass";

/** The class every icon in the app wears beside its pack's, and the one the upcast matches on. */
const MARKER_CLASS = "tn-icon";

export const INSERT_ICON_COMMAND = "insertIcon";

/**
 * The icon editing feature: an inline widget that stands for one icon of one installed icon pack,
 * written as `<span class="tn-icon bx bx-star"></span>` — the form icons take everywhere else in
 * the application, so the share theme and the in-app help draw it without knowing about the editor.
 *
 * Which icon to insert is the {@link InlineIconUI} plugin's business; this one only inserts it.
 */
export default class InlineIconEditing extends Plugin {

    public static get pluginName() {
        return "InlineIconEditing" as const;
    }

    public static get requires() {
        return [ Widget ] as const;
    }

    init() {
        const editor = this.editor;

        editor.model.schema.register(ICON, {
            allowWhere: "$text",
            isInline: true,
            // Self-contained: the caret cannot be put inside it, and it is selected as a unit.
            isObject: true,
            // Colouring needs no converter of ours; CKEditor's own carry these two.
            allowAttributes: [ ICON_CLASS, "fontColor", "fontBackgroundColor" ]
        });

        editor.conversion.for("upcast").elementToElement({
            view: {
                name: "span",
                classes: [ MARKER_CLASS ]
            },
            model: (viewElement, { writer }) => writer.createElement(ICON, {
                [ICON_CLASS]: readIconClass(viewElement)
            })
        });

        // An empty element rather than a container: the data pipeline fills an empty container
        // with an `&nbsp;`, which would be drawn as a space beside the icon.
        editor.conversion.for("dataDowncast").elementToElement({
            model: ICON,
            view: (modelElement, { writer }) => writer.createEmptyElement("span", {
                class: viewClasses(modelElement)
            })
        });

        editor.conversion.for("editingDowncast").elementToElement({
            model: ICON,
            view: (modelElement, { writer }) => toWidget(
                writer.createContainerElement("span", { class: viewClasses(modelElement) }),
                writer,
                { label: editor.t("Icon") }
            )
        });

        editor.commands.add(INSERT_ICON_COMMAND, new InsertIconCommand(editor));
    }

}

/** Puts one icon where the selection is. See {@link InlineIconEditing}. */
class InsertIconCommand extends Command {

    override refresh() {
        const model = this.editor.model;
        const parent = model.document.selection.focus?.parent;
        const isAllowed = parent instanceof ModelElement && model.schema.checkChild(parent, ICON);

        this.isEnabled = !this.editor.isReadOnly && isAllowed;
    }

    override execute({ iconClass }: { iconClass: string }) {
        if (!iconClass.trim()) {
            return;
        }

        const model = this.editor.model;

        model.change((writer: ModelWriter) => {
            const icon = writer.createElement(ICON, {
                // The caret's own attributes, so an icon put into coloured text is that colour.
                ...Object.fromEntries(model.document.selection.getAttributes()),
                [ICON_CLASS]: iconClass
            });

            model.insertObject(icon, null, null, { setSelection: "after" });
        });
    }

}

/** The pack's classes, which is everything the element wears apart from {@link MARKER_CLASS}. */
function readIconClass(viewElement: ViewElement) {
    return Array.from(viewElement.getClassNames())
        .filter((className) => className !== MARKER_CLASS)
        .join(" ");
}

/** What the element wears in the view: the marker class, then the pack's own. */
function viewClasses(modelElement: ModelElement) {
    const iconClass = modelElement.getAttribute(ICON_CLASS);

    return iconClass ? `${MARKER_CLASS} ${iconClass}` : MARKER_CLASS;
}
