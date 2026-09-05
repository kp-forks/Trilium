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

/** One entry the dialog offers. */
export interface PickerItem {
    key: string;
    caption: string;
    /** An icon class, `bx` prefix included. */
    icon?: string;
}

/** A set of items under a heading. */
export interface PickerItemGroup {
    key: string;
    groupHeader: string;
    items: PickerItem[];
}

export interface ItemPickerDialogOptions {
    title?: string;
    /**
     * What can be picked: either the items themselves or groups of them, never mixed.
     *
     * Used as given, so the caller works them out before opening the dialog rather than making the
     * user wait for it.
     */
    items: PickerItem[] | PickerItemGroup[];
    /** Placeholder for the search field. */
    placeholder?: string;
    /** Called with the item picked, or with null when the dialog was dismissed. */
    callback?: (item: PickerItem | null) => void;
}

/** How long typing is debounced before the list is filtered. Matches the settings search. */
const DEBOUNCE_MS = 150;

/**
 * Picks one item out of many, grouped and searchable, and closes on the pick.
 *
 * The list is narrowed by {@link FilterProvider}, the filter the settings search uses: each item
 * asks whether it matches and is shown or collapsed, so nothing is mounted or unmounted as the
 * query changes and the collapse can be animated.
 *
 * Opened through `dialog.pickSingleItem()`, named for the single pick: picking several at once will
 * be the same dialog with a different result.
 */
export default function ItemPickerDialog() {
    const opts = useRef<ItemPickerDialogOptions>();
    /** The item picked, reported once the dialog has closed rather than while it is closing. */
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
            {/* The settings search field, which is also used over the lists of the dialogs the
                settings open. */}
            <SettingsSearch
                inputRef={searchRef}
                query={query}
                onChange={setQuery}
                placeholder={opts.current?.placeholder ?? t("item_picker.search")}
            />

            <FilterProvider query={settled}>
                {/* The empty state is laid over this rather than following it, so it stays put
                    while the list collapses underneath. */}
                <div className="item-picker-results">
                    {/* Animated as the dialog opens: the items are its content rather than
                        something arriving into it. */}
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
 * One item, rendered whether or not it matches: collapsed rather than unmounted, so the list closes
 * over what was filtered out instead of jumping from one set to the next.
 */
function PickerRow({ item, onPick }: { item: PickerItem, onPick: (item: PickerItem) => void }) {
    const matched = useFilterMatch(item.caption);

    return (
        <section
            // Marked as a match for the card, which is what keeps a group rendered while any of its
            // items is still shown.
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

/** The caption with the search terms marked wherever they occur. */
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

/** Whether `items` holds groups rather than items. */
function isGroup(entry: PickerItem | PickerItemGroup): entry is PickerItemGroup {
    return "items" in entry;
}

/**
 * The items as groups, whichever form the caller gave.
 *
 * A plain list becomes one group with no heading, so the dialog renders one shape rather than two.
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
 * The caption split into matched and unmatched parts.
 *
 * Matched against the raw text, so a term that matched only after normalisation, an accent dropped
 * for instance, is left unmarked rather than marked in the wrong place.
 */
function split(text: string, tokens?: string[]) {
    if (!tokens?.length) {
        return [ { text, marked: false } ];
    }

    // A capturing group puts the matches among the parts, at the odd indices.
    const terms = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi");
    return text.split(terms)
        .map((part, index) => ({ text: part, marked: index % 2 === 1 }))
        .filter((part) => part.text !== "");
}
