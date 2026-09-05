import "./TemplateSelectionCard.css";

import { buildTemplateId } from "@triliumnext/commons";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";

import type FNote from "../../entities/fnote";
import dialog from "../../services/dialog";
import { t } from "../../services/i18n";
import note_create from "../../services/note_create";
import {
    type NoteTypeOption, noteTypeOptionGroupTitle, resolveNoteTypeOptions
} from "../../services/note_types";
import { type PickerItem, type PickerItemGroup } from "../dialogs/item_picker";
import ActionButton from "./ActionButton";
import { useNoteTypeOptions } from "./hooks";
import Icon from "./Icon";
import { type SortableItem, SortableCard } from "./SortableCard";
import {
    openTemplateMenu, quickEdit, remove, type TemplateCommands, templateNoteId
} from "./template_commands";

export interface TemplateSelectionCardProps {
    heading: string;
    /** A sentence explaining what the templates are for, shown under the heading. */
    instruction: string;
    /** The note the templates belong to, and the parent of any created here. */
    note: FNote;
    /** The title given to a template created here. */
    newTemplateName?: string;
    /** The templates on offer, as note type ids, in display order. */
    templates: string[];
    /** Called with the whole list after every change. */
    onChange: (templates: string[]) => void;
}

/**
 * The templates a note can be created from, in the order they are offered.
 *
 * The order is editable, the first template being the default until another is picked. Entries are
 * added from what the app can already create, or created here; the caller owns the list and decides
 * what it means.
 *
 * The card reads everything a note can be created from itself, so a caller only supplies the
 * current list and where new templates belong.
 */
export default function TemplateSelectionCard({
    heading, instruction, note, newTemplateName, templates, onChange
}: TemplateSelectionCardProps) {
    /**
     * The current list, which the card renders from.
     *
     * Held rather than read from the prop on every render: a change is written through at once, and
     * a caller with nothing to re-render for would otherwise leave the list unchanged.
     */
    const [ ids, setIds ] = useState(templates);
    /** Everything a note can be created from, kept current as templates are edited. */
    const available = useNoteTypeOptions();
    /**
     * Templates created here, which the app has yet to report back.
     *
     * A template is a note, and it becomes known through the entity change that creates it: until
     * that arrives there is nothing to render the entry from, so it would be stored but not shown.
     */
    const [ made, setMade ] = useState<NoteTypeOption[]>([]);

    useEffect(() => setIds(templates), [ templates ]);

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

    const drop = useCallback((key: string) => {
        const next = ids.filter((id) => id !== key);
        setIds(next);
        onChange(next);
    }, [ ids, onChange ]);

    /** What the menu on a template does to the list, the rest acting on the note alone. */
    const commands = useMemo<TemplateCommands>(() => ({
        onDuplicated: (sourceNoteId, copy) => {
            const source = offered.find(
                (option) => option.options.templateNoteId === sourceNoteId);
            const option: NoteTypeOption = {
                id: buildTemplateId(copy.noteId),
                title: copy.title,
                icon: copy.icon,
                group: "user",
                options: { ...source?.options ?? { type: "text" }, templateNoteId: copy.noteId }
            };

            setMade((was) => [ ...was, option ]);
            // Beside what it was copied from, which is where a copy is looked for.
            const at = source ? ids.indexOf(source.id) : -1;
            const next = [ ...ids ];
            next.splice(at < 0 ? ids.length : at + 1, 0, option.id);
            setIds(next);
            onChange(next);
        },
        onDeleted: (noteId) => drop(buildTemplateId(noteId))
    }), [ drop, ids, offered, onChange ]);

    /** Asks which of the templates not already offered to add, and returns it as an entry. */
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

    /** Creates a template and opens it for editing. */
    const create = useCallback(async () => {
        const template = await note_create.createTemplateNote(
            note.noteId, newTemplateName ?? t("template_selection.new-name"));
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
    }, [ newTemplateName, note ]);

    return (
        <SortableCard
            heading={heading}
            description={instruction}
            items={items}
            onChange={store}
            // The grip leads, so the trailing edge is left to what each entry carries there.
            gripPlacement="start"
            onItemKeyDown={(item, event) => {
                const noteId = templateNoteId(item.key);
                if (!noteId) {
                    return;
                }

                if (event.key === " ") {
                    event.preventDefault();
                    quickEdit(noteId);
                } else if (event.key === "Delete") {
                    event.preventDefault();
                    remove(noteId, commands);
                }
            }}
            renderItem={(item, index) => (
                <>
                    {item.icon && <Icon icon={item.icon} />}
                    <span className="template-selection-name">{item.caption}</span>

                    {/* Only a template is a note, and only a note has commands of its own. */}
                    {templateNoteId(item.key) && (
                        <ActionButton
                            className="template-selection-menu"
                            icon="bx bx-dots-vertical-rounded"
                            text={t("template_selection.menu")}
                            onClick={(event) => {
                                event.stopPropagation();
                                const noteId = templateNoteId(item.key);
                                if (noteId) {
                                    openTemplateMenu(event, noteId, commands);
                                }
                            }}
                        />
                    )}

                    {/* The last template is not removable: with none offered, nothing could be
                        created. */}
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
 * The templates the app ships are excluded: they are a starting point for a template of one's own
 * rather than something to create from repeatedly.
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
