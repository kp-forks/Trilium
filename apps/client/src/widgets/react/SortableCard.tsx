import "./SortableCard.css";

import clsx from "clsx";
import { ComponentChildren } from "preact";
import { flushSync } from "preact/compat";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import { t } from "../../services/i18n";
import { Card, type CardProps } from "./Card";
import { useFlip } from "./flip";
import Icon from "./Icon";

/** How many buttons the foot of a card holds before they are too narrow to read. */
const MAX_CREATION_BUTTONS = 3;

/**
 * How long a finger rests on the grip before the segment follows it.
 *
 * A finger on a grip is as likely to be scrolling the page as carrying a segment, and resting is
 * what tells the two apart: one that moves on scrolls as it would anywhere else, and one that
 * stays takes the segment up. Matches the board's own cards.
 */
const TOUCH_HOLD_MS = 400;

/** How far it may stray in that time and still be resting rather than scrolling. */
const TOUCH_SLACK_PX = 8;

/** One entry of a {@link SortableCard}, named by a key that outlives the order it stands in. */
export interface SortableItem {
    key: string;
    /** What the segment reads, for a card that draws its entries itself. */
    caption?: ComponentChildren;
    /** An icon class, `bx` prefix included, drawn before the caption. */
    icon?: string;
}

/**
 * One way of making an entry, drawn as a button at the foot of the card.
 *
 * What an entry is is the caller's: the button can ask with a dialog or a picker of its own, and
 * answering with nothing makes none.
 */
export interface ItemCreationButton<T extends SortableItem> {
    label: string;
    /** An icon class, `bx` prefix included. */
    icon?: string;
    onCreateItem: () => T | undefined | Promise<T | undefined>;
}

export interface SortableCardProps<T extends SortableItem> extends CardProps {
    /** The entries, in the order they stand. */
    items: T[];
    /** Said with the whole list in its new order, whenever the reader changes it. */
    onChange: (items: T[]) => void;
    /**
     * Draws what stands inside a segment, for a card that shows more than a name. Without it the
     * segment reads the item's own caption and icon.
     */
    renderItem?: (item: T, index: number) => ComponentChildren;
    /**
     * The ways an entry can be made, drawn as a row of buttons at the foot of the card and left out
     * where there are none. Up to three, past which they are too narrow to read.
     *
     * The first of them is what Enter beside an entry makes, that being the one a card leads with.
     */
    itemCreationButtons?: ItemCreationButton<T>[];
    /** The entry the reader is on, for a card whose selection the caller keeps. */
    selectedKey?: string;
    onSelect?: (key: string) => void;
}

/**
 * A card whose segments the reader can put in any order.
 *
 * Each entry is one segment, carried by the grip on its trailing edge or moved with the keyboard,
 * and the segments slide out of each other's way as it goes. A segment travels up and down only,
 * and no further than the ends of the card it stands in.
 *
 * The order is the caller's: every change is reported through `onChange`, and the card draws
 * whatever it is handed back. It knows nothing of what the entries mean, so the same card sorts a
 * list of preferences, of columns, or of anything else named by a key.
 */
export function SortableCard<T extends SortableItem>({
    items, onChange, renderItem, itemCreationButtons, selectedKey, onSelect, className, ...card
}: SortableCardProps<T>) {
    if ((itemCreationButtons?.length ?? 0) > MAX_CREATION_BUTTONS) {
        throw new Error("Up to three item creation buttons are supported");
    }

    const listRef = useRef<HTMLDivElement>(null);
    const adderRef = useRef<HTMLElement>(null);
    const dragRef = useRef<Drag<T>>();
    /** A finger resting on a grip, which becomes a carry once it has rested long enough. */
    const holdRef = useRef<Hold>();
    /**
     * The order while a segment is being carried, which the caller is told of once it lands.
     *
     * Kept until the caller answers with an order of its own, so the segments stay where they were
     * put rather than springing back for the frames in between.
     */
    const [ draft, setDraft ] = useState<T[] | null>(null);
    const [ draggedKey, setDraggedKey ] = useState<string>();
    const [ ownSelection, setOwnSelection ] = useState<string>();
    /** The entry just added, which opens out and fades in where it lands. */
    const [ addedKey, setAddedKey ] = useState<string>();
    /** Which segment takes focus once the card has been drawn again, a move having moved it. */
    const pendingFocus = useRef<string>();

    const shown = draft ?? items;
    const selected = selectedKey ?? ownSelection;

    useEffect(() => {
        // The caller has answered, so the draft has served its purpose. Not while a segment is
        // being carried: that order is still being decided.
        if (!dragRef.current) {
            setDraft(null);
        }
    }, [ items ]);

    const segmentOf = useCallback(
        (key: string) => listRef.current?.querySelector<HTMLElement>(`[data-key="${key}"]`), []);

    // The carried segment is left out: it stands where the pointer holds it, and would otherwise be
    // slid back to the place the list has made for it.
    useFlip(listRef, {
        selector: ".tn-sortable-segment:not(.tn-sortable-dragging)",
        grow: (segment) => segment.dataset.key === addedKey
    });

    useEffect(() => () => window.clearTimeout(holdRef.current?.timer), []);

    useLayoutEffect(() => {
        const key = pendingFocus.current;
        if (!key) {
            return;
        }

        pendingFocus.current = undefined;
        segmentOf(key)?.focus();
    });

    const select = useCallback((key: string) => {
        setOwnSelection(key);
        onSelect?.(key);
    }, [ onSelect ]);

    /** Stands the reader on an entry, wherever they were before it. */
    const focusEntry = useCallback((index: number) => {
        const key = shown[index]?.key;
        if (!key) {
            return;
        }

        pendingFocus.current = key;
        select(key);
        segmentOf(key)?.focus();
    }, [ segmentOf, select, shown ]);

    /** Puts the entry at `from` where `to` is, and leaves the reader standing on it. */
    const moveItem = useCallback((from: number, to: number) => {
        const order = moved(shown, from, to);
        if (!order) {
            return;
        }

        pendingFocus.current = shown[from].key;
        setDraft(order);
        onChange(order);
    }, [ onChange, shown ]);

    /** Ends the carry, keeping where the segment was put or putting the order back as it was. */
    const endDrag = useCallback((keep: boolean) => {
        const drag = dragRef.current;
        if (!drag) {
            return;
        }

        dragRef.current = undefined;
        const segment = segmentOf(drag.key);
        if (segment) {
            segment.style.transform = "";
        }

        listRef.current?.releasePointerCapture?.(drag.pointerId);
        setDraggedKey(undefined);
        pendingFocus.current = drag.key;

        if (!keep) {
            setDraft(null);
            return;
        }

        setDraft(drag.order);
        if (drag.order.some((item, index) => item.key !== drag.was[index].key)) {
            onChange(drag.order);
        }
    }, [ onChange, segmentOf ]);

    /** Takes up the segment, which is where the carry begins and where it is drawn as held. */
    const startDrag = useCallback((key: string, pointerId: number, clientY: number) => {
        const segment = segmentOf(key);
        if (!segment) {
            return;
        }

        dragRef.current = {
            key,
            pointerId,
            grabbedAt: clientY,
            from: segment.offsetTop,
            height: segment.offsetHeight,
            order: shown,
            was: shown
        };

        setDraggedKey(key);
        select(key);
        segment.focus();
    }, [ segmentOf, select, shown ]);

    const cancelHold = useCallback(() => {
        window.clearTimeout(holdRef.current?.timer);
        holdRef.current = undefined;
    }, []);

    const beginDrag = useCallback((event: PointerEvent, key: string) => {
        const list = listRef.current;
        if (!list || !segmentOf(key) || (event.pointerType === "mouse" && event.button !== 0)) {
            return;
        }

        // The gesture is the grip's alone: it must not also scroll the page under a finger, nor
        // start a selection under a mouse.
        event.preventDefault();
        list.setPointerCapture?.(event.pointerId);

        // A mouse on a grip means only one thing, so it is taken up at once. A finger has to rest
        // first, since it is also how the page is scrolled.
        if (event.pointerType === "mouse") {
            startDrag(key, event.pointerId, event.clientY);
            return;
        }

        cancelHold();
        holdRef.current = {
            pointerId: event.pointerId,
            from: { x: event.clientX, y: event.clientY },
            // Where the finger is when the rest is over, so a hand that settles by a pixel or two
            // does not carry the segment off by as much.
            at: event.clientY,
            timer: window.setTimeout(() => {
                const held = holdRef.current;
                holdRef.current = undefined;
                if (held) {
                    startDrag(key, held.pointerId, held.at);
                }
            }, TOUCH_HOLD_MS)
        };
    }, [ cancelHold, segmentOf, startDrag ]);

    const dragTo = useCallback((clientY: number) => {
        const drag = dragRef.current;
        const list = listRef.current;
        const segment = drag && segmentOf(drag.key);
        if (!drag || !list || !segment) {
            return;
        }

        // Held inside the card: the segment goes no higher than the first place and no lower than
        // the last, whatever the pointer does past them.
        const room = Math.max(0, list.clientHeight - drag.height);
        const top = Math.min(Math.max(drag.from + (clientY - drag.grabbedAt), 0), room);

        const order = orderFor(drag, segment, top, segmentOf);
        if (order) {
            drag.order = order;
            // Drawn before the segment is placed, so it is placed against the room the list has
            // just made for it rather than against the place it is leaving.
            flushSync(() => setDraft(order));
        }

        segment.style.transform = `translateY(${top - segment.offsetTop}px)`;
    }, [ segmentOf ]);

    /**
     * Makes an entry and puts it at `at`, or at the foot of the card where it is given no place.
     *
     * The reader is left standing on an entry made among the others, that being where they asked
     * for it; one made at the foot leaves them on the button that made it, so another can follow.
     */
    const add = useCallback(async (create: ItemCreationButton<T>["onCreateItem"], at?: number) => {
        const created = await create();
        if (!created) {
            return;
        }

        const order = [ ...shown ];
        order.splice(at ?? order.length, 0, created);
        setAddedKey(created.key);
        setDraft(order);
        if (at !== undefined) {
            pendingFocus.current = created.key;
        }

        onChange(order);
    }, [ onChange, shown ]);

    const onSegmentKeyDown = useCallback((event: KeyboardEvent, index: number) => {
        if (event.key === "Escape" && dragRef.current) {
            event.preventDefault();
            endDrag(false);
            return;
        }

        // An entry is made beside the one the reader is standing on, the way a spreadsheet adds a
        // row: below it, or above it with Shift. Made the way the card leads with, there being no
        // button under the reader's hand to say which of them was meant.
        const leading = itemCreationButtons?.[0];
        if (event.key === "Enter" && leading && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            add(leading.onCreateItem, event.shiftKey ? index : index + 1);
            return;
        }

        const control = event.ctrlKey || event.metaKey;
        const last = shown.length - 1;
        const to = placeFor(event, index, last);

        if (to === undefined) {
            // Below the last entry stands the segment that adds another, which the reader steps
            // onto rather than past. It holds no entry, so there is nothing to move onto it.
            if (!control && event.key === "ArrowDown" && index === last) {
                event.preventDefault();
                adderRef.current?.querySelector<HTMLElement>(".tn-sortable-adder")?.focus();
            }

            return;
        }

        event.preventDefault();
        if (control) {
            moveItem(index, to);
        } else {
            focusEntry(to);
        }
    }, [ add, endDrag, focusEntry, itemCreationButtons, moveItem, shown ]);

    const onAddKeyDown = useCallback((event: KeyboardEvent) => {
        // Back up into the entries. Home and End name the first and last of them here as they do
        // on an entry itself, this segment being one the reader stands on rather than one of them.
        const control = event.ctrlKey || event.metaKey;
        const to = control || !shown.length ? undefined : lastPlaceFor(event, shown.length - 1);
        if (to === undefined) {
            return;
        }

        event.preventDefault();
        focusEntry(to);
    }, [ focusEntry, shown ]);

    return (
        <Card className={clsx("tn-sortable-card", className)} {...card}>
            <div
                ref={listRef}
                className="tn-sortable-list"
                role="list"
                onPointerMove={(event) => {
                    const held = holdRef.current;
                    if (held?.pointerId === event.pointerId) {
                        // Gone before it settled, which is a finger on its way somewhere else.
                        held.at = event.clientY;
                        if (Math.hypot(event.clientX - held.from.x, event.clientY - held.from.y)
                                > TOUCH_SLACK_PX) {
                            cancelHold();
                        }

                        return;
                    }

                    if (dragRef.current?.pointerId === event.pointerId) {
                        event.preventDefault();
                        dragTo(event.clientY);
                    }
                }}
                // Refused only while a segment is being carried, which is what keeps the page
                // still under it. Until then the gesture is the page's, so a finger that came to
                // scroll scrolls, grip or no grip.
                onTouchMove={(event) => {
                    if (dragRef.current) {
                        event.preventDefault();
                    }
                }}
                onPointerUp={() => {
                    cancelHold();
                    endDrag(true);
                }}
                onPointerCancel={() => {
                    cancelHold();
                    endDrag(false);
                }}
            >
                {shown.map((item, index) => (
                    <section
                        key={item.key}
                        data-key={item.key}
                        role="listitem"
                        tabIndex={0}
                        aria-current={item.key === selected ? "true" : undefined}
                        className={clsx("tn-card-section tn-sortable-segment", {
                            "tn-sortable-dragging": item.key === draggedKey,
                            "tn-sortable-selected": item.key === selected,
                            "tn-sortable-appearing": item.key === addedKey
                        })}
                        onFocus={() => select(item.key)}
                        onKeyDown={(event) => onSegmentKeyDown(event, index)}
                        onAnimationEnd={() => setAddedKey(undefined)}
                    >
                        <span className="tn-sortable-content">
                            {renderItem
                                ? renderItem(item, index)
                                : <>
                                    {item.icon && <Icon icon={item.icon} />}
                                    <span className="tn-sortable-caption">{item.caption}</span>
                                </>}
                        </span>

                        <span
                            className="tn-sortable-grip"
                            title={t("sortable_card.reorder")}
                            aria-hidden="true"
                            onPointerDown={(event) => beginDrag(event, item.key)}
                        >
                            <svg viewBox="0 0 16 16">
                                <line x1="3" y1="6" x2="13" y2="6" />
                                <line x1="3" y1="10" x2="13" y2="10" />
                            </svg>
                        </span>
                    </section>
                ))}

                {/* Painted with nothing of its own: the gaps between the buttons are the card's
                    parent showing through, and each button carries what a segment is painted
                    with. */}
                {!!itemCreationButtons?.length && (
                    <section
                        ref={adderRef}
                        className="tn-card-section tn-sortable-adders"
                        onKeyDown={onAddKeyDown}
                    >
                        {itemCreationButtons.map((button, index) => (
                            <button
                                // The place in the row, which is the only thing that tells two
                                // buttons apart: a label is the caller's to repeat.
                                key={index}
                                type="button"
                                className="tn-sortable-adder"
                                onClick={() => add(button.onCreateItem)}
                            >
                                {button.icon && <Icon icon={button.icon} />}
                                <span>{button.label}</span>
                            </button>
                        ))}
                    </section>
                )}
            </div>
        </Card>
    );
}

/** A finger resting on a grip, until it has rested long enough to carry the segment. */
interface Hold {
    pointerId: number;
    /** Where it went down, against which a stray is measured. */
    from: { x: number, y: number };
    /** Where it is now, which is where the carry begins from. */
    at: number;
    timer: number;
}

/** A segment being carried: where it was taken from, and the order it has reached. */
interface Drag<T extends SortableItem> {
    key: string;
    pointerId: number;
    /** Where the pointer went down, against which everything after it is measured. */
    grabbedAt: number;
    /** Where the segment stood in the list when it was taken. */
    from: number;
    height: number;
    /** The order as it now stands, which is what the caller is told of. */
    order: T[];
    /** The order it was taken from, against which a carry that changed nothing is told. */
    was: T[];
}

/**
 * Where the carried segment now belongs: after every segment it has covered the middle of.
 *
 * The others are measured where the list has them now rather than where they started, a segment
 * sliding out of the way already being reported at the place it is sliding to.
 *
 * A segment gives way as the carried one's near edge passes its middle: the foot of the carried
 * segment for one below, its head for one above. Measured by the middles alone, the carried
 * segment would have to reach the very middle of the last place to take it, which is the one place
 * it cannot be carried past, and the last place could not be reached at all.
 */
function orderFor<T extends SortableItem>(
    drag: Drag<T>, carried: HTMLElement, top: number,
    segmentOf: (key: string) => HTMLElement | null | undefined
) {
    const from = drag.order.findIndex((item) => item.key === drag.key);
    let to = 0;

    for (const item of drag.order) {
        const segment = item.key !== drag.key && segmentOf(item.key);
        if (!segment) {
            continue;
        }

        const middle = segment.offsetTop + segment.offsetHeight / 2;
        const isBelow = segment.offsetTop > carried.offsetTop;
        if (isBelow ? middle < top + drag.height : middle <= top) {
            to++;
        }
    }

    return from === to ? undefined : moved(drag.order, from, to);
}

/** The list with one entry put elsewhere, or nothing where that would leave it as it stands. */
function moved<T>(items: T[], from: number, to: number) {
    const place = Math.min(Math.max(to, 0), items.length - 1);
    if (from < 0 || from >= items.length || place === from) {
        return undefined;
    }

    const order = [ ...items ];
    order.splice(place, 0, ...order.splice(from, 1));
    return order;
}

/** Which entry a key asks for from the segment standing below them all. */
function lastPlaceFor(event: KeyboardEvent, last: number) {
    switch (event.key) {
        case "ArrowUp":
        case "End":
            return last;
        case "Home":
            return 0;
        default:
            return undefined;
    }
}

/**
 * Which place a key asks for, or nothing for a key the card leaves alone.
 *
 * The same keys move a segment and step between them, the difference being Control: the board's
 * cards are moved this way too, so a reader who knows one knows the other.
 */
function placeFor(event: KeyboardEvent, index: number, last: number) {
    switch (event.key) {
        case "ArrowUp":
            return index - 1 < 0 ? undefined : index - 1;
        case "ArrowDown":
            return index + 1 > last ? undefined : index + 1;
        case "Home":
            return index === 0 ? undefined : 0;
        case "End":
            return index === last ? undefined : last;
        default:
            return undefined;
    }
}
