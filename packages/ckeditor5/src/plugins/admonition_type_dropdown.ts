import { Plugin, type ListDropdownButtonDefinition, Collection, ViewModel, createDropdown, addListToDropdown, DropdownButtonView } from "ckeditor5";
import { Admonition, ADMONITION_TYPES, type AdmonitionCommand, type AdmonitionType } from "@triliumnext/ckeditor5-admonition";

const ADMONITION_ICONS: Record<AdmonitionType, string> = {
    note: "📝",
    tip: "💡",
    important: "📌",
    caution: "⚠️",
    warning: "🚨"
};

/**
 * Toolbar item which displays the list of admonition types in a dropdown.
 */
export default class AdmonitionTypeDropdown extends Plugin {

    static get requires() {
        return [Admonition] as const;
    }

    public init() {
        const editor = this.editor;
        const componentFactory = editor.ui.componentFactory;

        const itemDefinitions = this._getTypeListItemDefinitions();
        const command = editor.commands.get("admonition") as AdmonitionCommand;

        componentFactory.add("admonitionTypeDropdown", _locale => {
            const dropdownView = createDropdown(editor.locale, DropdownButtonView);
            dropdownView.buttonView.set({
                withText: true
            });
            dropdownView.bind("isEnabled").to(command, "value", value => !!value);
            dropdownView.buttonView.bind("label").to(command, "value", (value) => {
                if (!value) return "";
                const typeDef = ADMONITION_TYPES[value as AdmonitionType];
                const icon = ADMONITION_ICONS[value as AdmonitionType];
                return typeDef ? `${icon} ${typeDef.title}` : value;
            });
            dropdownView.on("execute", evt => {
                const source = evt.source as any;
                editor.execute("admonition", {
                    forceValue: source._admonitionType
                });
                editor.editing.view.focus();
            });
            addListToDropdown(dropdownView, itemDefinitions);
            return dropdownView;
        });
    }

    private _getTypeListItemDefinitions(): Collection<ListDropdownButtonDefinition> {
        const editor = this.editor;
        const command = editor.commands.get("admonition") as AdmonitionCommand;
        const itemDefinitions = new Collection<ListDropdownButtonDefinition>();

        for (const [type, typeDef] of Object.entries(ADMONITION_TYPES)) {
            const icon = ADMONITION_ICONS[type as AdmonitionType];
            const definition: ListDropdownButtonDefinition = {
                type: "button",
                model: new ViewModel({
                    _admonitionType: type,
                    label: `${icon} ${typeDef.title}`,
                    role: "menuitemradio",
                    withText: true
                })
            };

            definition.model.bind("isOn").to(command, "value", value => {
                return value === type;
            });

            itemDefinitions.add(definition);
        }

        return itemDefinitions;
    }

}
