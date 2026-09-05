import { useCallback } from "preact/hooks";

import type FNote from "../../../entities/fnote";
import { t } from "../../../services/i18n";
import Modal from "../../react/Modal";
import PromotedAttributesCard from "../../react/PromotedAttributesCard";
import TemplateSelectionCard from "../../react/TemplateSelectionCard";
import type { PromotedAttribute } from "../promoted_attributes";
import BoardApi from "./api";

/** The board's settings, other than its columns and cards. */
export default function BoardProperties({ api, note, shown, onClose }: {
    api: BoardApi,
    /** The board note, which is the parent of any template created here. */
    note: FNote,
    shown: boolean,
    onClose: () => void
}) {
    const store = useCallback(
        (templates: string[]) => api.setCardTemplateIds(templates), [ api ]);
    const storeAttributes = useCallback(
        (attributes: PromotedAttribute[]) => api.setPromotedAttributes(attributes), [ api ]);

    return (
        <Modal
            className="board-properties-dialog"
            title={t("board_view.properties-title")}
            size="lg"
            scrollable
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

            <PromotedAttributesCard
                heading={t("board_view.promoted-attributes")}
                instruction={t("board_view.promoted-attributes-hint")}
                note={note}
                settings={api.getStoredPromotedAttributes()}
                ignored={[ api.statusAttribute ]}
                onChange={storeAttributes}
            />
        </Modal>
    );
}
