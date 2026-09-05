import "./item_picker.css";

import clsx from "clsx";
import { useMemo, useRef, useState } from "preact/hooks";

import { escapeRegExp } from "../../services/utils";
import { t } from "../../services/i18n";
import { Card } from "../react/Card";
import { FilterProvider, filterRoleClass, useFilterMatch, useFilterState } from "../react/filter";
import SettingsSearch from "../type_widgets/options/components/SettingsSearch";
import { useDebouncedValue, useTriliumEvent } from "../react/hooks";
import Icon from "../react/Icon";
import Modal from "../react/Modal";
import NoItems from "../react/NoItems";

/** One thing that can be picked. */
export interface PickerItem {
    key: string;
    caption: string;
    /** An icon class, `bx` prefix included. */
    icon?: string;
}

/** A run of items under a heading of their own. */
export interface PickerItemGroup {
    key: string;
    groupHeader: string;
    items: PickerItem[];
}

export interface ItemPickerDialogOptions {
    title?: string;
    /**
     * What can be picked: either the items themselves or groups of them, never the two mixed.
     *
     * They are read as they are given, so whatever it takes to work them out is done before the
     * dialog is opened rather than while the reader waits.
     */
    items: PickerItem[] | PickerItemGroup[];
    /** What the search field reads while it is empty. */
    placeholder?: string;
    /** Said with what was picked, or with nothing where the reader backed out. */
    callback?: (item: PickerItem | null) => void;
}

/** How long the typing settles before the list answers it. Matches the settings search. */
const DEBOUNCE_MS = 150;

/**
 * Picks one thing out of many, grouped, searchable, and closed by the picking.
 *
 * The list is narrowed by {@link FilterProvider}, the same filter the settings search runs on: each
 * item asks whether it matches and is left standing or folded away, so nothing is mounted or torn
 * down as the query changes and the folding can be drawn.
 *
 * Summoned through `dialog.pickSingleItem()`, which is named for the one thing it does now: picking
 * several at once is the same dialog with a different answer.
 */
export default function ItemPickerDialog() {
    const opts = useRef<ItemPickerDialogOptions>();
    /** What was picked, said once the dialog has closed rather than while it is closing. */
    const picked = useRef<PickerItem | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const [ shown, setShown ] = useState(false);
    const [ query, setQuery ] = useState("");

    useTriliumEvent("showItemPickerDialog", (options) => {
        opts.current = options;
        picked.current = null;
        setQuery("");
        setShown(true);
    });

    const groups = useMemo(() => asGroups(opts.current?.items ?? []), [ opts.current?.items ]);
    const settled = useDebouncedValue(query.trim(), DEBOUNCE_MS);

    function pick(item: PickerItem) {
        picked.current = item;
        setShown(false);
    }

    return (
        <Modal
            className="item-picker-dialog"
            title={opts.current?.title ?? t("item_picker.title")}
            size="sm"
            scrollable
            isFullPageOnMobile
            zIndex={2000}
            show={shown}
            stackable
            onShown={() => searchRef.current?.focus()}
            onHidden={() => {
                setShown(false);
                opts.current?.callback?.(picked.current);
                opts.current = undefined;
            }}
        >
            {/* The field the settings are looked through, which stands over the lists of the
                dialogs they open as well. */}
            <SettingsSearch
                inputRef={searchRef}
                query={query}
                onChange={setQuery}
                placeholder={opts.current?.placeholder ?? t("item_picker.search")}
            />

            <FilterProvider query={settled}>
                {/* What stands where the list was is laid over this rather than after it, so it
                    holds still while the list folds away under it. */}
                <div className="item-picker-results">
                    {/* Drawn once the dialog has opened, which is what the rise comes from: the
                        items are the dialog's content rather than something arriving into it. */}
                    <div className="item-picker-groups">
                        {groups.map((group) => (
                            <Card key={group.key} heading={group.groupHeader || undefined}>
                                {group.items.map((item) => (
                                    <PickerRow key={item.key} item={item} onPick={pick} />
                                ))}
                            </Card>
                        ))}
                    </div>

                    <NoItems
                        className="item-picker-empty"
                        icon="bx bx-search"
                        text={t("item_picker.nothing-found")}
                    />
                </div>
            </FilterProvider>
        </Modal>
    );
}

/**
 * One item, standing whether or not it matches: folded away rather than taken down, so the list
 * closes over what was filtered out instead of blinking from one set to the next.
 */
function PickerRow({ item, onPick }: { item: PickerItem, onPick: (item: PickerItem) => void }) {
    const matched = useFilterMatch(item.caption);

    return (
        <section
            // Marked as a match for the card holding it, which is what keeps a group standing
            // while anything in it is still being shown.
            className={clsx("tn-card-section tn-card-highlight-on-hover item-picker-item",
                filterRoleClass(matched ? "match" : undefined),
                { "item-picker-folded": !matched })}
            tabIndex={matched ? 0 : -1}
            aria-hidden={!matched}
            onClick={() => onPick(item)}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onPick(item);
                }
            }}
        >
            {item.icon && <Icon icon={item.icon} />}
            <Marked text={item.caption} />
        </section>
    );
}

/** What the reader typed, marked wherever it stands in the caption. */
function Marked({ text }: { text: string }) {
    const filter = useFilterState();
    const parts = useMemo(() => split(text, filter?.tokens), [ text, filter ]);

    return (
        <span className="item-picker-caption">
            {parts.map((part, index) => part.marked
                ? <mark key={index}>{part.text}</mark>
                : part.text)}
        </span>
    );
}

/** Whether what was given is groups of items rather than the items themselves. */
function isGroup(entry: PickerItem | PickerItemGroup): entry is PickerItemGroup {
    return "items" in entry;
}

/**
 * The items as groups, whichever of the two the caller gave.
 *
 * A plain list becomes one group with no heading, so the dialog draws one shape rather than two.
 */
function asGroups(items: PickerItem[] | PickerItemGroup[]): PickerItemGroup[] {
    const [ first ] = items;
    if (!first) {
        return [];
    }

    return isGroup(first)
        ? items as PickerItemGroup[]
        : [ { key: "", groupHeader: "", items: items as PickerItem[] } ];
}

/**
 * The caption cut into the parts that were typed and the parts that were not.
 *
 * Marked against the text as it stands, so a term matched by its shape alone, an accent dropped for
 * instance, is left unmarked rather than marked in the wrong place.
 */
function split(text: string, tokens?: string[]) {
    if (!tokens?.length) {
        return [ { text, marked: false } ];
    }

    // Split on a capturing group, so what was typed comes back among the parts: at the odd
    // places, whatever the terms matched.
    const terms = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi");
    return text.split(terms)
        .map((part, index) => ({ text: part, marked: index % 2 === 1 }))
        .filter((part) => part.text !== "");
}
