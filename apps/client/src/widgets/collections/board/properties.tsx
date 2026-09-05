import { useCallback } from "preact/hooks";

import type FNote from "../../../entities/fnote";
import { t } from "../../../services/i18n";
import Modal from "../../react/Modal";
import TemplateSelectionCard from "../../react/TemplateSelectionCard";
import BoardApi from "./api";

/**
 * What the board is set up with, apart from the columns and the cards themselves.
 *
 * One card for now, the templates a new card is made from; the dialog is the place the rest of the
 * board's own settings will be put as they arrive.
 */
export default function BoardProperties({ api, note, shown, onClose }: {
    api: BoardApi,
    /** The board itself, which is what a template made here is filed under. */
    note: FNote,
    shown: boolean,
    onClose: () => void
}) {
    const store = useCallback(
        (templates: string[]) => api.setCardTemplateIds(templates), [ api ]);

    return (
        <Modal
            className="board-properties-dialog"
            title={t("board_view.properties-title")}
            size="lg"
            scrollable
            zIndex={2000}
            show={shown}
            onHidden={onClose}
        >
            <TemplateSelectionCard
                heading={t("board_view.card-templates")}
                instruction={t("board_view.card-templates-hint")}
                note={note}
                templates={api.getCardTemplateIds()}
                onChange={store}
            />
        </Modal>
    );
}
