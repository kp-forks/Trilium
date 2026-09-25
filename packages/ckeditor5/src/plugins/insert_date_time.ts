import { ButtonView, Command, Plugin } from 'ckeditor5';
import dateTimeIcon from '../icons/date-time.svg?raw';

export const COMMAND_NAME = 'insertDateTimeToText';

export default class InsertDateTimePlugin extends Plugin {
    init() {
        const editor = this.editor;
        const t = editor.t;

        const command = new InsertDateTimeCommand(editor);
        editor.commands.add(COMMAND_NAME, command);

        editor.ui.componentFactory.add('dateTime', locale => {
            const view = new ButtonView( locale );

            view.set( {
                label: t('Insert date/time'),
                icon: dateTimeIcon,
                tooltip: true
            } );

            view.bind('isEnabled').to(command, 'isEnabled');
            view.on('execute', () => {
                editor.execute(COMMAND_NAME);
                editor.editing.view.focus();
            });
            return view;
        });
    }
}

/**
 * Inserts the current date and time, formatted by the host through `formatDateTime()`, in place of
 * the selection. The text takes the selection's attributes, so it stays bold inside bold text.
 */
class InsertDateTimeCommand extends Command {

    execute() {
        const model = this.editor.model;
        const selection = model.document.selection;
        const editorEl = this.editor.editing.view.getDomRoot();
        const text = glob.getComponentByEl<EditorComponent>(editorEl).formatDateTime(new Date());

        model.change(writer => {
            const attributes = selection.getAttributes();
            model.insertContent(writer.createText(text, attributes));
        });
    }

}
