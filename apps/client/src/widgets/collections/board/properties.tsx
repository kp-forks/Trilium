import "./properties.css";

import { useCallback, useEffect, useMemo, useState } from "preact/hooks";

import dialog from "../../../services/dialog";
import { t } from "../../../services/i18n";
import { type NoteTypeOption, noteTypeOptionGroupTitle, resolveNoteTypeOptions } from "../../../services/note_types";
import ActionButton from "../../react/ActionButton";
import Icon from "../../react/Icon";
import { type PickerItem, type PickerItemGroup } from "../../dialogs/item_picker";
import Modal from "../../react/Modal";
import { type SortableItem, SortableCard } from "../../react/SortableCard";
import BoardApi from "./api";

/**
 * What the board is set up with, apart from the columns and the cards themselves.
 *
 * One card for now, the templates a new card is made from; the dialog is the place the rest of the
 * board's own settings will be put as they arrive.
 */
export default function BoardProperties({ api, available, shown, onClose }: {
    api: BoardApi,
    /** Everything a card could be made from, as the board read them. */
    available: NoteTypeOption[],
    shown: boolean,
    onClose: () => void
}) {
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
            <CardTemplates api={api} available={available} shown={shown} />
        </Modal>
    );
}

/**
 * The templates a new card can be made from, in the order the board stores them.
 *
 * The order is the reader's to change, since the first of them is what a card is made from until
 * another is picked, and what the pill in a card's editor leads with.
 */
function CardTemplates({ api, available, shown }: {
    api: BoardApi,
    available: NoteTypeOption[],
    shown: boolean
}) {
    /**
     * The list as it stands here, which is what the card is drawn from.
     *
     * Held rather than read from the board on every draw: a change made here is written straight
     * through, and the board has nothing to draw this dialog again for, so what is shown would
     * otherwise be the list as it was when the dialog opened.
     */
    const [ ids, setIds ] = useState(() => api.getCardTemplateIds());

    // Read afresh each time the dialog opens, the board having been changed elsewhere meanwhile.
    useEffect(() => {
        if (shown) {
            setIds(api.getCardTemplateIds());
        }
    }, [ api, shown ]);

    const offered = useMemo(
        () => resolveNoteTypeOptions(ids, available), [ available, ids ]);
    const items = useMemo(() => offered.map((option) => ({
        key: option.id,
        caption: option.title,
        icon: option.icon
    })), [ offered ]);

    const store = useCallback((order: SortableItem[]) => {
        const next = order.map((item) => item.key);
        setIds(next);
        api.setCardTemplateIds(next);
    }, [ api ]);

    /** Asks which of the ones not already offered to add, and answers with it as an entry. */
    const addExisting = useCallback(async () => {
        const taken = new Set(offered.map((option) => option.id));
        const picked = await dialog.pickSingleItem({
            title: t("board_view.add-template-title"),
            items: pickable(available, taken)
        });

        return picked
            ? { key: picked.key, caption: picked.caption, icon: picked.icon }
            : undefined;
    }, [ available, offered ]);

    return (
        <SortableCard
            heading={t("board_view.card-templates")}
            description={t("board_view.card-templates-hint")}
            items={items}
            onChange={store}
            // The grip leads, so the trailing edge is left to what each entry carries there.
            gripPlacement="start"
            renderItem={(item, index) => (
                <>
                    {item.icon && <Icon icon={item.icon} />}
                    <span className="board-template-name">{item.caption}</span>

                    {/* The last one left is not removable: a board with nothing to make a card
                        from could make none, so the write behind this refuses it anyway. */}
                    {items.length > 1 && (
                        <ActionButton
                            className="board-template-remove"
                            icon="bx bx-x"
                            text={t("board_view.remove-template")}
                            onClick={(event) => {
                                event.stopPropagation();
                                store(items.filter((unused, at) => at !== index));
                            }}
                        />
                    )}
                </>
            )}
            itemCreationButtons={[
                {
                    label: t("board_view.add-existing-template"),
                    icon: "bx bx-list-plus",
                    onCreateItem: addExisting
                },
                {
                    label: t("board_view.create-template"),
                    icon: "bx bx-plus",
                    onCreateItem: () => undefined
                }
            ]}
        />
    );
}

/**
 * What can still be added, as groups for the picker.
 *
 * The templates the app ships are left out: they are a starting point for a note of one's own
 * rather than something a board is set up to make its cards from.
 */
function pickable(available: NoteTypeOption[], taken: Set<string>): PickerItemGroup[] {
    const groups = new Map<string, PickerItemGroup>();

    for (const option of available) {
        if (option.group === "builtin" || taken.has(option.id)) {
            continue;
        }

        const group = groups.get(option.group) ?? {
            key: option.group,
            groupHeader: noteTypeOptionGroupTitle(option.group),
            items: []
        };

        const entry: PickerItem = {
            key: option.id, caption: option.title, icon: option.icon
        };
        group.items.push(entry);
        groups.set(option.group, group);
    }

    return [ ...groups.values() ];
}
