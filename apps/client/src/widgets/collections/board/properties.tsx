import { useCallback } from "preact/hooks";

import type FNote from "../../../entities/fnote";
import { t } from "../../../services/i18n";
import Modal from "../../react/Modal";
import TemplateSelectionCard from "../../react/TemplateSelectionCard";
import BoardApi from "./api";

/**
 * The board's own settings, apart from its columns and cards.
 *
 * One card for now, the templates a new card is created from; the rest of the board's settings go
 * here as they arrive.
 */
export default function BoardProperties({ api, note, shown, onClose }: {
    api: BoardApi,
    /** The board itself, and the parent of any template created here. */
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
                newTemplateName={t("board_view.new-template-name")}
                templates={api.getCardTemplateIds()}
                onChange={store}
            />
        </Modal>
    );
}
