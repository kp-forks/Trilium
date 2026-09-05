import "./TemplateSelectionCard.css";

import { buildTemplateId } from "@triliumnext/commons";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";

import type FNote from "../../entities/fnote";
import dialog from "../../services/dialog";
import { t } from "../../services/i18n";
import note_create from "../../services/note_create";
import {
    getNoteTypeOptions, type NoteTypeOption, noteTypeOptionGroupTitle, resolveNoteTypeOptions
} from "../../services/note_types";
import { type PickerItem, type PickerItemGroup } from "../dialogs/item_picker";
import ActionButton from "./ActionButton";
import Icon from "./Icon";
import { type SortableItem, SortableCard } from "./SortableCard";

export interface TemplateSelectionCardProps {
    heading: string;
    /** The sentence saying what the templates are for, shown under the heading. */
    instruction: string;
    /** The note the templates belong to, which is what one made here is filed under. */
    note: FNote;
    /** What is offered now, as note type ids, in the order they are offered in. */
    templates: string[];
    /** Said with the whole list whenever the reader changes it. */
    onChange: (templates: string[]) => void;
}

/**
 * The templates something is made from, in the order they are offered in.
 *
 * The order is the reader's to change, since the first of them is what is made until another is
 * picked. Entries are added from what the app can already make, or made here and written straight
 * away; the caller keeps the list and decides what it means.
 *
 * Everything a note can be made from is read by the card itself, so a caller has only to say what
 * it holds now and where a new one belongs.
 */
export default function TemplateSelectionCard({
    heading, instruction, note, templates, onChange
}: TemplateSelectionCardProps) {
    /**
     * The list as it stands here, which is what the card is drawn from.
     *
     * Held rather than read from the caller on every draw: a change is written straight through,
     * and a caller that has nothing to redraw for would otherwise leave the list as it was found.
     */
    const [ ids, setIds ] = useState(templates);
    /** Everything a note can be made from, read once the card is drawn. */
    const [ available, setAvailable ] = useState<NoteTypeOption[]>([]);
    /**
     * What was made here, which the app has yet to read back.
     *
     * A template is a note, and it is known from the change that files it: until that arrives there
     * is nothing to draw the entry from, and it would stand in the stored list without being shown.
     */
    const [ made, setMade ] = useState<NoteTypeOption[]>([]);

    useEffect(() => setIds(templates), [ templates ]);

    useEffect(() => {
        let listening = true;
        getNoteTypeOptions()
            .then((options) => {
                if (listening) {
                    setAvailable(options);
                }
            })
            .catch((e) => console.error("Failed to read what a note can be made from:", e));

        return () => { listening = false; };
    }, []);

    const known = useMemo(
        () => [ ...available, ...made.filter((option) => !available.some((a) => a.id === option.id)) ],
        [ available, made ]);
    const offered = useMemo(() => resolveNoteTypeOptions(ids, known), [ ids, known ]);
    const items = useMemo(() => offered.map((option) => ({
        key: option.id,
        caption: option.title,
        icon: option.icon
    })), [ offered ]);

    const store = useCallback((order: SortableItem[]) => {
        const next = order.map((item) => item.key);
        setIds(next);
        onChange(next);
    }, [ onChange ]);

    /** Asks which of the ones not already offered to add, and answers with it as an entry. */
    const addExisting = useCallback(async () => {
        const taken = new Set(offered.map((option) => option.id));
        const picked = await dialog.pickSingleItem({
            title: t("template_selection.add-title"),
            items: pickable(available, taken)
        });

        return picked
            ? { key: picked.key, caption: picked.caption, icon: picked.icon }
            : undefined;
    }, [ available, offered ]);

    /** Makes one and opens it, the reader writing what a note made from it holds. */
    const create = useCallback(async () => {
        const template = await note_create.createTemplateNote(
            note.noteId, t("template_selection.new-name"));
        if (!template) {
            return undefined;
        }

        const option: NoteTypeOption = {
            id: buildTemplateId(template.noteId),
            title: template.title,
            icon: template.getIcon(),
            group: "user",
            options: { type: template.type, mime: template.mime, templateNoteId: template.noteId }
        };

        setMade((was) => [ ...was, option ]);
        return { key: option.id, caption: option.title, icon: option.icon };
    }, [ note ]);

    return (
        <SortableCard
            heading={heading}
            description={instruction}
            items={items}
            onChange={store}
            // The grip leads, so the trailing edge is left to what each entry carries there.
            gripPlacement="start"
            renderItem={(item, index) => (
                <>
                    {item.icon && <Icon icon={item.icon} />}
                    <span className="template-selection-name">{item.caption}</span>

                    {/* The last one left is not removable: nothing offered is nothing that could be
                        made, so the caller has none to fall back on. */}
                    {items.length > 1 && (
                        <ActionButton
                            className="template-selection-remove"
                            icon="bx bx-x"
                            text={t("template_selection.remove")}
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
                    label: t("template_selection.add-existing"),
                    icon: "bx bx-list-plus",
                    onCreateItem: addExisting
                },
                {
                    label: t("template_selection.create"),
                    icon: "bx bx-plus",
                    onCreateItem: create
                }
            ]}
        />
    );
}

/**
 * What can still be added, as groups for the picker.
 *
 * The templates the app ships are left out: they are a starting point for a note of one's own
 * rather than something to be made from over and over.
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
