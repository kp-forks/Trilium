import {
    addListToDropdown, Collection, Command, createDropdown, type Editor, type ListDropdownItemDefinition, Plugin,
    SplitButtonView, ViewModel
} from 'ckeditor5';
import dateTimeIcon from '../icons/date-time.svg?raw';

export const COMMAND_NAME = 'insertDateTimeToText';

/** The Day.js formats the split button offers besides the user's own `customDateTimeFormat`. */
export const DATE_TIME_PRESETS = [
    'YYYY-MM-DD',
    'HH:mm',
    'D MMMM YYYY',
    'dddd, D MMMM YYYY',
    'YYYY-MM-DDTHH:mm:ssZ'
] as const;

/**
 * Introduces the `dateTime` split button: the button inserts the current date and time in the
 * user's `customDateTimeFormat`, and the list offers the same date in each of `DATE_TIME_PRESETS`.
 */
export default class InsertDateTimePlugin extends Plugin {
    init() {
        const editor = this.editor;
        const t = editor.t;

        const command = new InsertDateTimeCommand(editor);
        editor.commands.add(COMMAND_NAME, command);

        editor.ui.componentFactory.add('dateTime', locale => {
            const dropdownView = createDropdown(locale, SplitButtonView);
            const items = new Collection<ListDropdownItemDefinition>();

            addListToDropdown(dropdownView, items);

            dropdownView.buttonView.set({
                label: t('Insert date/time'),
                icon: dateTimeIcon,
                tooltip: true
            });
            dropdownView.bind('isEnabled').to(command, 'isEnabled');

            // The labels show the current time, so they are rendered each time the list opens.
            dropdownView.on('change:isOpen', (_evt, _name, isOpen) => {
                if (isOpen) {
                    items.clear();
                    items.addMany(createFormatItems(editor));
                }
            });

            dropdownView.buttonView.on('execute', () => {
                editor.execute(COMMAND_NAME);
                editor.editing.view.focus();
            });
            dropdownView.on('execute', evt => {
                const { format } = evt.source as { format?: string };
                editor.execute(COMMAND_NAME, { format });
                editor.editing.view.focus();
            });

            return dropdownView;
        });
    }
}

/**
 * Inserts the current date and time, formatted by the host through `formatDateTime()`, in place of
 * the selection. The text takes the selection's attributes, so it stays bold inside bold text.
 */
class InsertDateTimeCommand extends Command {

    /**
     * @param options.format a Day.js format string; without one, the host applies the user's
     * `customDateTimeFormat`.
     */
    execute({ format }: { format?: string } = {}) {
        const model = this.editor.model;
        const selection = model.document.selection;
        const text = formatNow(this.editor, format);

        model.change(writer => {
            const attributes = selection.getAttributes();
            model.insertContent(writer.createText(text, attributes));
        });
    }

}

/**
 * One list item per format, labeled with the current date in it. A preset that renders the same
 * as the user's default is left out.
 */
function createFormatItems(editor: Editor) {
    const formats = [ undefined, ...DATE_TIME_PRESETS ];
    const seenLabels = new Set<string>();
    const definitions: ListDropdownItemDefinition[] = [];

    for (const format of formats) {
        const label = formatNow(editor, format);
        if (seenLabels.has(label)) {
            continue;
        }

        seenLabels.add(label);
        definitions.push({
            type: 'button',
            model: new ViewModel({ format, label, withText: true })
        });
    }

    return definitions;
}

function formatNow(editor: Editor, format?: string) {
    const editorEl = editor.editing.view.getDomRoot();
    return glob.getComponentByEl<EditorComponent>(editorEl).formatDateTime(new Date(), format);
}
