import { NOTE_CONVERSION_IDS, NoteConversionId } from "@triliumnext/commons";
import { useEffect, useState } from "preact/hooks";

import { t } from "../../../services/i18n";
import FormSelect from "../../react/FormSelect";
import { useSpacedUpdate } from "../../react/hooks";
import AbstractBulkAction, { ActionDefinition } from "../abstract_bulk_action";
import BulkAction from "../BulkAction";

/** Human-readable label for each conversion id, in the order they appear in the combo box. */
const CONVERSION_OPTIONS: { value: NoteConversionId | ""; title: string }[] = [
    { value: "", title: t("convert_note.choose_conversion") },
    ...NOTE_CONVERSION_IDS.map((value) => ({ value, title: t(`convert_note.conversion_${value}`) }))
];

function ConvertNoteBulkActionComponent({ bulkAction, actionDef }: { bulkAction: AbstractBulkAction, actionDef: ActionDefinition }) {
    const [ conversion, setConversion ] = useState<string>(actionDef.conversion ?? "");
    const spacedUpdate = useSpacedUpdate(() => bulkAction.saveAction({ conversion }));
    useEffect(() => spacedUpdate.scheduleUpdate(), [ conversion ]);

    return (
        <BulkAction
            bulkAction={bulkAction}
            label={t("convert_note.convert_note_to")}
            helpText={<p>{t("convert_note.help_text")}</p>}
        >
            <FormSelect
                values={CONVERSION_OPTIONS}
                keyProperty="value"
                titleProperty="title"
                currentValue={conversion}
                onChange={setConversion}
            />
        </BulkAction>
    );
}

export default class ConvertNoteBulkAction extends AbstractBulkAction {

    doRender() {
        return <ConvertNoteBulkActionComponent bulkAction={this} actionDef={this.actionDef} />;
    }

    getConfirmationMessage() {
        // Only warn once a conversion has actually been selected.
        return this.actionDef.conversion ? t("convert_note.warning") : null;
    }

    static get actionName() {
        return "convertNote";
    }

    static get actionTitle() {
        return t("convert_note.convert_note");
    }
}
