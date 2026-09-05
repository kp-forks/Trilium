import "./PromotedAttributesCard.css";

import { createPortal } from "preact/compat";
import { useCallback, useMemo, useRef, useState } from "preact/hooks";

import type FNote from "../../entities/fnote";
import type { Attribute } from "../../services/attribute_parser";
import attributes, { removeOwnedAttributesByNameOrType } from "../../services/attributes";
import { t } from "../../services/i18n";
import {
    AttributeDetail, type AttributeDetailOpts
} from "../attribute_widgets/attribute_detail";
import {
    deleteAttributeInSubtree, type PromotedAttribute, type PromotedAttributeSetting,
    renameAttributeInSubtree, resolvePromotedAttributes, storedPromotedAttributes
} from "../collections/promoted_attributes";
import ActionButton from "./ActionButton";
import FormToggle from "./FormToggle";
import { useTriliumEvent } from "./hooks";
import Icon from "./Icon";
import { type SortableItem, SortableCard } from "./SortableCard";

/** The definition a new attribute starts from, which the reader names in the editor. */
const NEW_DEFINITION: Attribute = {
    type: "label",
    name: "label:myLabel",
    value: "promoted,single,text",
    isInheritable: true
};

export interface PromotedAttributesCardProps {
    heading: string;
    /** Explains what arranging the attributes does. Shown under the heading. */
    instruction: string;
    /** The collection that defines them, and the note an attribute created here is written to. */
    note: FNote;
    /** The order and what is hidden, as the collection's view config stores it. */
    settings: PromotedAttributeSetting[] | undefined;
    /** Attributes the collection draws itself, such as the label a board groups by. */
    ignored?: string[];
    /** Called with the whole list after every change, for the caller to store. */
    onChange: (attributes: PromotedAttribute[]) => void;
}

/**
 * The promoted attributes a collection shows on its items, in the order they are shown.
 *
 * The reader reorders the list, turns an attribute off without deleting it, and edits or creates a
 * definition through the attribute editor. The definitions belong to `note`; the order and what is
 * hidden belong to the caller, which stores whatever `onChange` reports.
 */
export default function PromotedAttributesCard({
    heading, instruction, note, settings, ignored, onChange
}: PromotedAttributesCardProps) {
    const [ shown, setShown ] = useState(() => resolvePromotedAttributes(note, settings, ignored));
    const [ detail, setDetail ] = useState<AttributeDetailOpts | null>(null);
    /** What the editor last reported, which is what a save writes. */
    const edited = useRef<Attribute>();
    /** What the editor was handed, against which a renamed definition is recognised. */
    const original = useRef<Attribute>();

    // A definition created, renamed or deleted here arrives as an attribute change like any other,
    // and the order the reader has put the rest in is kept across it.
    useTriliumEvent("entitiesReloaded", ({ loadResults }) => {
        const affects = loadResults.getAttributeRows()
            .some((attribute) => attributes.isAffecting(attribute, note));
        if (affects) {
            setShown((was) =>
                resolvePromotedAttributes(note, storedPromotedAttributes(was), ignored));
        }
    });

    const items = useMemo(() => shown.map((attribute) => ({
        key: attribute.name,
        caption: attribute.title,
        icon: attribute.type === "relation" ? "bx bx-transfer" : "bx bx-tag"
    })), [ shown ]);

    const store = useCallback((next: PromotedAttribute[]) => {
        setShown(next);
        onChange(next);
    }, [ onChange ]);

    const reorder = useCallback((order: SortableItem[]) => {
        const byName = new Map(shown.map((attribute) => [ attribute.name, attribute ]));
        store(order.flatMap((item) => {
            const attribute = byName.get(item.key);
            return attribute ? [ attribute ] : [];
        }));
    }, [ shown, store ]);

    const setHidden = useCallback((name: string, hidden: boolean) => {
        store(shown.map((attribute) =>
            attribute.name === name ? { ...attribute, hidden } : attribute));
    }, [ shown, store ]);

    /** Opens the editor on a definition, or on a new one where none is given. */
    const openEditor = useCallback((event: MouseEvent | undefined, attribute?: PromotedAttribute) => {
        const definition: Attribute = attribute
            ? {
                type: "label",
                name: attribute.definitionName,
                value: attribute.definitionValue,
                isInheritable: attribute.isInheritable
            }
            : { ...NEW_DEFINITION };

        original.current = attribute ? { ...definition } : undefined;
        edited.current = undefined;
        setDetail({
            attribute: definition,
            allAttributes: [ definition ],
            isOwned: true,
            // Where the press was, or below the top of the page for one made from the keyboard.
            x: event?.pageX ?? 0,
            y: event?.pageY ?? 150,
            focus: attribute ? undefined : "name",
            hideMultiplicity: true
        });
    }, []);

    /**
     * Writes what the editor was left holding.
     *
     * A renamed definition takes its values with it, so the items keep what they carry. The
     * definition it was renamed from is removed, and so is one whose inheritance changed:
     * `set-attribute` writes the value of a definition that already exists and nothing else, so
     * the new inheritance would be dropped unless the definition is written afresh.
     */
    const save = useCallback(async () => {
        const definition = edited.current;
        const was = original.current;
        setDetail(null);
        if (!definition?.name.includes(":")) {
            return;
        }

        const [ type, name ] = definition.name.split(":", 2) as [ "label" | "relation", string ];
        const isRenamed = !!was && was.name !== definition.name;
        if (isRenamed && was) {
            const [ , previous ] = was.name.split(":", 2);
            await renameAttributeInSubtree(note.noteId, type, previous, name);
        }

        if (was && (isRenamed || was.isInheritable !== definition.isInheritable)) {
            await removeOwnedAttributesByNameOrType(note, "label", was.name);
        }

        await attributes.setLabel(
            note.noteId, definition.name, definition.value, definition.isInheritable);
    }, [ note ]);

    /** Takes the definition away, and with it the values written against it. */
    const remove = useCallback(async () => {
        const definition = original.current;
        setDetail(null);
        if (!definition?.name.includes(":")) {
            return;
        }

        const [ type, name ] = definition.name.split(":", 2) as [ "label" | "relation", string ];
        await deleteAttributeInSubtree(note.noteId, type, name);
        await removeOwnedAttributesByNameOrType(note, "label", definition.name);
    }, [ note ]);

    return (
        <>
            <SortableCard
                className="promoted-attributes-card"
                heading={heading}
                description={instruction}
                items={items}
                onChange={reorder}
                // The grip leads, so the trailing edge is left to the toggle each entry carries.
                gripPlacement="start"
                renderItem={(item) => {
                    const attribute = shown.find((candidate) => candidate.name === item.key);
                    return attribute && (
                        <>
                            {item.icon && <Icon icon={item.icon} />}
                            <span className="promoted-attribute-name">{item.caption}</span>

                            <ActionButton
                                className="promoted-attribute-edit"
                                icon="bx bx-edit"
                                text={t("promoted_attributes.edit_attribute")}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    openEditor(event, attribute);
                                }}
                            />

                            <FormToggle
                                currentValue={!attribute.hidden}
                                switchOnTooltip={t("promoted_attributes.shown_on_items")}
                                switchOffTooltip={t("promoted_attributes.hidden_from_items")}
                                onChange={(visible) => setHidden(attribute.name, !visible)}
                            />
                        </>
                    );
                }}
                itemCreationButtons={[
                    {
                        label: t("promoted_attributes.create_attribute"),
                        icon: "bx bx-plus",
                        // The editor answers for what is made, and the definition it writes arrives
                        // as an attribute change: one that is not promoted resolves to nothing and
                        // so is never listed.
                        onCreateItem: (event) => {
                            openEditor(event);
                            return undefined;
                        }
                    }
                ]}
            />

            {createPortal(
                <AttributeDetail
                    opts={detail}
                    currentNoteId={note.noteId}
                    onDismiss={() => setDetail(null)}
                    onCancel={() => setDetail(null)}
                    onAttributesChanged={([ definition ]) => { edited.current = definition; }}
                    onSaveAndClose={save}
                    onDelete={remove}
                />,
                document.body)}
        </>
    );
}
