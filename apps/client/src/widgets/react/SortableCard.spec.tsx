import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SortableCard, type SortableItem } from "./SortableCard";

// i18next is never initialised under test, so a stock label would be undefined and the segment it
// stands in would read nothing at all.
vi.mock("../../services/i18n", () => ({
    t: (key: string) => key
}));

/** How tall every segment stands, and the gap between two of them, as the card is laid out. */
const SEGMENT_HEIGHT = 40;
const SEGMENT_GAP = 4;

/** What the card asks of a finger before it carries a segment: how long, and how still. */
const TOUCH_HOLD = 400;
const TOUCH_SLACK = 8;

describe("SortableCard", () => {
    let container: HTMLElement;
    let items: SortableItem[];
    let changed: SortableItem[][];

    beforeEach(() => {
        // The rest a finger keeps is waited out rather than lived through.
        vi.useFakeTimers();
        items = [
            { key: "a", caption: "Alpha" },
            { key: "b", caption: "Beta" },
            { key: "c", caption: "Gamma" }
        ];
        changed = [];
    });

    afterEach(() => {
        vi.useRealTimers();
        render(null, container);
        container.remove();
    });

    it("reads its entries in order, with the card's own heading and sentence", () => {
        draw();

        expect(container.querySelector(".tn-card-heading")?.textContent).toContain("Order");
        expect(container.querySelector(".tn-card-description")?.textContent)
            .toBe("Put them as you like.");
        expect(captions()).toEqual([ "Alpha", "Beta", "Gamma" ]);
        // Every segment answers for itself, so any of them can be reached and moved by keyboard.
        expect(segments().every((segment) => segment.tabIndex === 0)).toBe(true);
    });

    /** The slot, for a card that shows more of an entry than its name. */
    it("draws each entry with what the caller gives it", () => {
        draw({ renderItem: (item, index) => <b>{`${index}:${item.key}`}</b> });

        expect(segments().map((segment) => segment.querySelector("b")?.textContent))
            .toEqual([ "0:a", "1:b", "2:c" ]);
    });

    describe("moving with the keyboard", () => {
        it("moves an entry one place, and reports the whole list in its new order", () => {
            draw();

            press(segments()[0], "ArrowDown", { ctrlKey: true });

            expect(changed.at(-1)?.map((item) => item.key)).toEqual([ "b", "a", "c" ]);
            expect(captions()).toEqual([ "Beta", "Alpha", "Gamma" ]);
            // The reader is left standing on the entry they moved, not on the place it left.
            expect(document.activeElement).toBe(segmentOf("a"));
        });

        it("sends an entry to either end", () => {
            draw();

            press(segments()[2], "Home", { ctrlKey: true });
            expect(changed.at(-1)?.map((item) => item.key)).toEqual([ "c", "a", "b" ]);

            press(segmentOf("c"), "End", { ctrlKey: true });
            expect(changed.at(-1)?.map((item) => item.key)).toEqual([ "a", "b", "c" ]);
        });

        /** There is nowhere past the ends, and a key that changes nothing is left to the page. */
        it("leaves an entry at the end where it is", () => {
            draw();
            const atTop = segments()[0];

            press(atTop, "ArrowUp", { ctrlKey: true });
            press(atTop, "Home", { ctrlKey: true });
            press(segments()[2], "End", { ctrlKey: true });
            press(segments()[2], "ArrowDown", { ctrlKey: true });

            expect(changed).toEqual([]);
            expect(captions()).toEqual([ "Alpha", "Beta", "Gamma" ]);
        });

        it("steps between entries without Control, moving nothing", () => {
            draw();

            // Nothing stands below the last entry on a card that cannot be added to.
            focus(segments()[2]);
            press(segments()[2], "ArrowDown");
            expect(document.activeElement).toBe(segmentOf("c"));

            press(segments()[0], "ArrowDown");
            expect(document.activeElement).toBe(segmentOf("b"));

            press(segmentOf("b"), "End");
            expect(document.activeElement).toBe(segmentOf("c"));

            press(segmentOf("c"), "Home");
            expect(document.activeElement).toBe(segmentOf("a"));

            expect(changed).toEqual([]);
        });
    });

    describe("selection", () => {
        it("selects the entry the reader reaches, and says which it is", () => {
            const onSelect = vi.fn();
            draw({ onSelect });

            focus(segmentOf("b"));

            expect(onSelect).toHaveBeenLastCalledWith("b");
            expect(segmentOf("b")?.className).toContain("tn-sortable-selected");
            expect(segmentOf("b")?.getAttribute("aria-current")).toBe("true");
            expect(segmentOf("a")?.className).not.toContain("tn-sortable-selected");
        });

        it("follows the selection the caller keeps", () => {
            draw({ selectedKey: "c" });

            expect(segmentOf("c")?.className).toContain("tn-sortable-selected");

            // What the reader does is reported; what is drawn stays the caller's to decide.
            focus(segmentOf("a"));
            expect(segmentOf("c")?.className).toContain("tn-sortable-selected");
            expect(segmentOf("a")?.className).not.toContain("tn-sortable-selected");
        });
    });

    describe("carrying a segment", () => {
        it("is carried by its grip alone, which says so while it is held", () => {
            draw();

            grab(segmentOf("a"));

            expect(segmentOf("a")?.className).toContain("tn-sortable-dragging");
            expect(captured).toEqual([ 1 ]);

            drop();
            expect(segmentOf("a")?.className).not.toContain("tn-sortable-dragging");
        });

        it("puts the entry where it was carried, and reports it once", () => {
            draw();

            grab(segmentOf("a"));
            // Past the middle of the second segment, which is what it changes places with.
            moveTo(SEGMENT_HEIGHT + SEGMENT_GAP + 1);

            expect(captions()).toEqual([ "Beta", "Alpha", "Gamma" ]);
            // Nothing is reported until it lands: a carry across the card is one change, not one
            // for every segment it passes.
            expect(changed).toEqual([]);

            drop();
            expect(changed.map((order) => order.map((item) => item.key)))
                .toEqual([ [ "b", "a", "c" ] ]);
        });

        /**
         * A segment gives way as the carried one's foot passes its middle, which is what puts the
         * last place within reach: the carried segment can be held no lower than that place, so
         * middle against middle it would have to reach a place it cannot be carried to.
         */
        it("takes the last place as its foot passes the middle of the last segment", () => {
            draw();
            const last = SEGMENT_HEIGHT * 2 + SEGMENT_GAP * 2;

            grab(segmentOf("a"));
            // Short of the last place by half a segment, and just past the middle of the one
            // standing in it.
            moveTo(last - SEGMENT_HEIGHT / 2 + 1);

            expect(captions()).toEqual([ "Beta", "Gamma", "Alpha" ]);
        });

        /** And the other way about: the head passing a middle is what sends a segment above it. */
        it("takes the first place as its head passes the middle of the first segment", () => {
            draw();

            grab(segmentOf("c"));
            moveTo(SEGMENT_HEIGHT / 2 - 1);

            expect(captions()).toEqual([ "Gamma", "Alpha", "Beta" ]);
        });

        it("carries an entry the whole way down, and back", () => {
            draw();

            grab(segmentOf("a"));
            moveTo(500);
            expect(captions()).toEqual([ "Beta", "Gamma", "Alpha" ]);

            moveTo(-500);
            expect(captions()).toEqual([ "Alpha", "Beta", "Gamma" ]);

            drop();
            // Back where it started, so there is nothing to report.
            expect(changed).toEqual([]);
        });

        /** The segment is held inside the card, whatever the pointer does past its ends. */
        it("carries it no further than the ends of the card", () => {
            draw();
            const carried = segmentOf("c");

            grab(carried);
            moveTo(-500);
            expect(shift(carried)).toBe(0);

            const [ first ] = segments();
            grab(first, 0);
            moveTo(500);
            // The last place a segment can stand in: the room the list has, less its own height.
            expect(shift(first)).toBe(listHeight() - SEGMENT_HEIGHT);
            drop();
        });

        /**
         * A card taller than the screen is scrolled while a segment is carried to an edge of it,
         * which moves the list out from under a pointer that has not itself moved. The segment
         * answers to the place in the card the pointer is over, not to the place on screen it was
         * taken from, or it would be left behind by everything the scrolling brought into view.
         */
        it("keeps the segment under the pointer while the card is scrolled", () => {
            draw();
            const carried = segmentOf("a");

            grab(carried);
            moveTo(SEGMENT_HEIGHT / 2);
            expect(shift(carried)).toBe(SEGMENT_HEIGHT / 2);

            // The card scrolls up by a segment, the pointer staying where it is.
            standAt(-SEGMENT_HEIGHT);
            moveTo(SEGMENT_HEIGHT / 2);

            expect(shift(carried)).toBe(SEGMENT_HEIGHT + SEGMENT_HEIGHT / 2);
        });

        it("puts the order back when the carry is abandoned", () => {
            draw();

            grab(segmentOf("a"));
            moveTo(500);
            expect(captions()).toEqual([ "Beta", "Gamma", "Alpha" ]);

            press(segmentOf("a"), "Escape");

            expect(captions()).toEqual([ "Alpha", "Beta", "Gamma" ]);
            expect(changed).toEqual([]);
            expect(segmentOf("a")?.className).not.toContain("tn-sortable-dragging");
        });

        it("puts it back when the pointer is taken away from it", () => {
            draw();

            grab(segmentOf("a"));
            moveTo(500);
            act(() => { list()?.dispatchEvent(pointerEvent("pointercancel", 0)); });

            expect(captions()).toEqual([ "Alpha", "Beta", "Gamma" ]);
            expect(changed).toEqual([]);
        });

        /**
         * A finger carries it the same way a mouse does, once it has rested on the grip. The grip
         * answers for the gesture as soon as it is touched, so a finger that meant to scroll the
         * page scrolls nothing wherever it lands on one: resting first is what tells them apart.
         */
        it("is carried by a finger, once it has rested on the grip", () => {
            draw();

            touch(segmentOf("a"));
            // Nothing is taken up by the press itself, however long the finger is there for.
            expect(segmentOf("a")?.className).not.toContain("tn-sortable-dragging");

            rest();
            // Held now, which the segment says for itself before it has gone anywhere.
            expect(segmentOf("a")?.className).toContain("tn-sortable-dragging");

            moveTo(SEGMENT_HEIGHT + SEGMENT_GAP + 1, { pointerType: "touch" });
            expect(captions()).toEqual([ "Beta", "Alpha", "Gamma" ]);

            drop();
            expect(changed.at(-1)?.map((item) => item.key)).toEqual([ "b", "a", "c" ]);
        });

        /**
         * The page is the gesture's until a segment is taken up: a finger that came to scroll
         * scrolls, wherever on the card it landed. Once one is being carried the move is refused,
         * which is what holds the page still under it.
         */
        it("leaves the page to scroll until a segment is being carried", () => {
            draw();

            touch(segmentOf("a"));
            expect(scrolls()).toBe(true);

            rest();
            expect(scrolls()).toBe(false);

            drop();
            expect(scrolls()).toBe(true);
        });

        /**
         * A thumb reaching across a phone lands on the near edge of a row far more easily than on
         * one particular end of it, so the rest is kept wherever the finger fell.
         */
        it("is carried by a finger resting anywhere on the segment", () => {
            draw();

            touch(segmentOf("a"), { onGrip: false });
            rest();
            expect(segmentOf("a")?.className).toContain("tn-sortable-dragging");

            moveTo(SEGMENT_HEIGHT + SEGMENT_GAP + 1, { pointerType: "touch" });
            drop();
            expect(changed.at(-1)?.map((item) => item.key)).toEqual([ "b", "a", "c" ]);
        });

        /** A mouse has no trouble reaching a mark, and a press elsewhere is for reading. */
        it("is not carried by a mouse pressed anywhere but the grip", () => {
            draw();

            act(() => {
                segmentOf("a")?.dispatchEvent(pointerEvent("pointerdown", 0));
            });
            moveTo(SEGMENT_HEIGHT + SEGMENT_GAP + 1);

            expect(segmentOf("a")?.className).not.toContain("tn-sortable-dragging");
            expect(captions()).toEqual([ "Alpha", "Beta", "Gamma" ]);
        });

        /** Whatever a control does with a press, carrying the row off is not it. */
        it("leaves a press that began on a control to the control", () => {
            draw({ renderItem: (item) => <button type="button">{item.caption}</button> });

            const control = segmentOf("a")?.querySelector("button");
            act(() => { control?.dispatchEvent(pointerEvent("pointerdown", 0, {
                pointerType: "touch", button: -1
            })); });
            rest();

            expect(segmentOf("a")?.className).not.toContain("tn-sortable-dragging");
            expect(changed).toEqual([]);
        });

        it("takes nothing up for a finger that strays before it has rested", () => {
            draw();

            touch(segmentOf("a"));
            moveTo(SEGMENT_HEIGHT, { pointerType: "touch" });
            rest();

            expect(segmentOf("a")?.className).not.toContain("tn-sortable-dragging");
            expect(captions()).toEqual([ "Alpha", "Beta", "Gamma" ]);
            expect(changed).toEqual([]);
        });

        /** A finger settling by a pixel or two is still resting, and carries nothing off by it. */
        it("takes it up for a finger that barely moves, from where the finger now is", () => {
            draw();

            touch(segmentOf("a"));
            moveTo(TOUCH_SLACK, { pointerType: "touch" });
            rest();

            expect(segmentOf("a")?.className).toContain("tn-sortable-dragging");
            expect(shift(segmentOf("a"))).toBe(0);
        });

        it("takes nothing up for a finger lifted before it has rested", () => {
            draw();

            touch(segmentOf("a"));
            drop();
            rest();

            expect(segmentOf("a")?.className).not.toContain("tn-sortable-dragging");
            expect(changed).toEqual([]);
        });

        it("carries a card of one entry nowhere, and says nothing about it", () => {
            items = [ { key: "a", caption: "Alpha" } ];
            draw();

            grab(segmentOf("a"));
            moveTo(500);
            drop();

            expect(captions()).toEqual([ "Alpha" ]);
            expect(changed).toEqual([]);
        });

        /** A press that is not the primary button is somebody else's: a menu, most likely. */
        it("is not carried by a right click", () => {
            draw();

            grab(segmentOf("a"), 0, { button: 2 });

            expect(segmentOf("a")?.className).not.toContain("tn-sortable-dragging");
        });
    });

    describe("adding an entry", () => {
        it("draws no segment for adding unless it is given one", () => {
            draw();
            expect(container.querySelector(".tn-sortable-adders")).toBeNull();

            draw({ itemCreationButtons: [ makes("d", "Delta") ] });
            expect(adder()?.textContent).toContain("Add");
        });

        it("appends what the caller made, and shows it arriving", async () => {
            draw({ itemCreationButtons: [ makes("d", "Delta", "Add a preference") ] });

            expect(adder()?.textContent).toContain("Add a preference");

            await click(adder());

            expect(changed.at(-1)?.map((item) => item.key)).toEqual([ "a", "b", "c", "d" ]);
            expect(captions()).toEqual([ "Alpha", "Beta", "Gamma", "Delta" ]);
            expect(segmentOf("d")?.className).toContain("tn-sortable-appearing");
            // The reader is left on the segment that adds, so another entry can follow.
            expect(document.activeElement).not.toBe(segmentOf("d"));

            // Shown once: the entry stays the one just made, and a redraw must not play it again.
            act(() => {
                segmentOf("d")?.dispatchEvent(
                    new AnimationEvent("animationend", { bubbles: true }));
            });
            expect(segmentOf("d")?.className).not.toContain("tn-sortable-appearing");
        });

        it("adds nothing where the caller answers with nothing, a picker being backed out of",
            async () => {
                draw({ itemCreationButtons: [ { label: "Add", onCreateItem: () => undefined } ] });

                await click(adder());

                expect(changed).toEqual([]);
                expect(captions()).toEqual([ "Alpha", "Beta", "Gamma" ]);
            });

        it("waits for a caller that asks the reader first", async () => {
            let answer: (item: SortableItem | undefined) => void = () => {};
            draw({ itemCreationButtons: [ { label: "Add", onCreateItem: () => new Promise(
                (resolve) => { answer = resolve; }) } ] });

            await click(adder());
            expect(changed).toEqual([]);

            await act(async () => { answer({ key: "d", caption: "Delta" }); });
            expect(changed.at(-1)?.map((item) => item.key)).toEqual([ "a", "b", "c", "d" ]);
        });

        it("offers a button for each way of making one, each the width of the others", async () => {
            draw({ itemCreationButtons: [
                makes("d", "Delta", "Add a note"),
                makes("e", "Epsilon", "Add a link"),
                makes("f", "Zeta", "Add a folder")
            ] });

            expect(adders().map((button) => button.textContent?.trim()))
                .toEqual([ "Add a note", "Add a link", "Add a folder" ]);
            // Of one width, however many there are, which the row shares out between them.
            expect(adders().every((button) => button.style.flex === "")).toBe(true);

            await click(adders()[1]);
            expect(changed.at(-1)?.map((item) => item.key)).toEqual([ "a", "b", "c", "e" ]);

            await click(adders()[2]);
            expect(changed.at(-1)?.map((item) => item.key)).toEqual([ "a", "b", "c", "e", "f" ]);
        });

        /** A label says what a button does, and two of them can say the same thing. */
        it("keeps two buttons that read alike apart", async () => {
            draw({ itemCreationButtons: [ makes("d", "Delta"), makes("e", "Epsilon") ] });

            expect(adders()).toHaveLength(2);

            await click(adders()[1]);
            expect(changed.at(-1)?.map((item) => item.key)).toEqual([ "a", "b", "c", "e" ]);
        });

        /** Three is as many as the foot of a card can read; a fourth is the caller's mistake. */
        it("refuses more than three ways of making an entry", () => {
            const buttons = [ makes("d", "D"), makes("e", "E"), makes("f", "F"), makes("g", "G") ];

            expect(() => draw({ itemCreationButtons: buttons }))
                .toThrow("Up to three item creation buttons are supported");
            expect(() => draw({ itemCreationButtons: buttons.slice(0, 3) })).not.toThrow();
        });

        /** Beside the entry the reader stands on, the way a spreadsheet adds a row. */
        it("makes an entry below the focused one for Enter, and above it for Shift and Enter",
            async () => {
                let made = 0;
                draw({ itemCreationButtons: [ {
                    label: "Add",
                    onCreateItem: () => ({ key: `d${++made}`, caption: `Delta ${made}` })
                } ] });

                press(segmentOf("a"), "Enter");
                await act(async () => {});
                expect(captions()).toEqual([ "Alpha", "Delta 1", "Beta", "Gamma" ]);
                expect(changed.at(-1)?.map((item) => item.key))
                    .toEqual([ "a", "d1", "b", "c" ]);

                press(segmentOf("c"), "Enter", { shiftKey: true });
                await act(async () => {});
                expect(captions()).toEqual([ "Alpha", "Delta 1", "Beta", "Delta 2", "Gamma" ]);
            });

        it("leaves the reader standing on what it made, which is shown arriving", async () => {
            draw({ itemCreationButtons: [ makes("d", "Delta") ] });

            press(segmentOf("b"), "Enter");
            await act(async () => {});

            expect(document.activeElement).toBe(segmentOf("d"));
            expect(segmentOf("d")?.className).toContain("tn-sortable-appearing");
        });

        it("makes nothing beside an entry where the card cannot be added to", async () => {
            draw();

            press(segmentOf("a"), "Enter");
            await act(async () => {});

            expect(captions()).toEqual([ "Alpha", "Beta", "Gamma" ]);
            expect(changed).toEqual([]);
        });

        it("makes nothing beside an entry where the caller answers with nothing", async () => {
            draw({ itemCreationButtons: [ { label: "Add", onCreateItem: () => undefined } ] });

            press(segmentOf("a"), "Enter");
            await act(async () => {});

            expect(captions()).toEqual([ "Alpha", "Beta", "Gamma" ]);
            expect(changed).toEqual([]);
        });

        /**
         * It is one of the places the reader stands, even though it holds no entry: stepping down
         * from the last entry reaches it, and the keys that name an entry lead back into them.
         */
        it("is stepped onto and off again, like the entries above it", () => {
            draw({ itemCreationButtons: [ makes("d", "Delta") ] });

            expect(adder()?.tabIndex).toBe(0);

            press(segmentOf("c"), "ArrowDown");
            expect(document.activeElement).toBe(adder());

            press(adder(), "ArrowUp");
            expect(document.activeElement).toBe(segmentOf("c"));

            press(adder(), "Home");
            expect(document.activeElement).toBe(segmentOf("a"));

            press(adder(), "End");
            expect(document.activeElement).toBe(segmentOf("c"));
        });

        /** Nothing stands below it, and a card of no entries has nowhere to lead back to. */
        it("goes nowhere from the segment that adds", () => {
            draw({ itemCreationButtons: [ makes("d", "Delta") ] });

            focus(adder());
            press(adder(), "ArrowDown");
            expect(document.activeElement).toBe(adder());

            items = [];
            draw({ itemCreationButtons: [ makes("d", "Delta") ] });
            focus(adder());
            press(adder(), "ArrowUp");
            expect(document.activeElement).toBe(adder());
        });

        /** It stands at the foot of the card to be pressed, not to be put in order with the rest. */
        it("leaves the segment for adding where it is", () => {
            draw({ itemCreationButtons: [ makes("d", "Delta") ] });
            expect(adder()?.querySelector(".tn-sortable-grip")).toBeNull();
            expect(adder()?.getAttribute("role")).not.toBe("listitem");

            press(adder(), "ArrowUp", { ctrlKey: true });
            expect(changed).toEqual([]);
            // Nor does a key meant for the entries carry the reader off it while Control is held.
            expect(document.activeElement).not.toBe(segmentOf("c"));
        });
    });

    it("carries the grip on the trailing edge of each segment, after what it reads", () => {
        draw();
        const [ first ] = segments();

        expect(first.lastElementChild?.className).toContain("tn-sortable-grip");
        expect(first.querySelector(".tn-sortable-grip svg line")).not.toBeNull();
        // The keyboard answers for what the grip does, so it is not read out a second time.
        expect(first.querySelector(".tn-sortable-grip")?.getAttribute("aria-hidden")).toBe("true");
    });

    /** The other edge, for a card whose entries carry something of their own on the trailing one. */
    it("carries it on the leading edge where the caller asks for it there", () => {
        draw({ gripPlacement: "start" });
        const [ first ] = segments();

        expect(first.firstElementChild?.className).toContain("tn-sortable-grip");
        expect(first.lastElementChild?.className).toContain("tn-sortable-content");

        // And carries a segment from there just the same.
        grab(first);
        moveTo(SEGMENT_HEIGHT + SEGMENT_GAP + 1);
        drop();
        expect(changed.at(-1)?.map((item) => item.key)).toEqual([ "b", "a", "c" ]);
    });

    /**
     * The order is the caller's: what it hands back is what the card draws, so a caller that keeps
     * the order elsewhere, or refuses a move, is drawn as it decides rather than as the card left
     * things.
     */
    it("draws the order the caller answers with", () => {
        draw();

        press(segments()[0], "ArrowDown", { ctrlKey: true });
        expect(captions()).toEqual([ "Beta", "Alpha", "Gamma" ]);

        // The caller keeps the order it had, which is what the card is drawn from again.
        redraw([ ...items ]);
        expect(captions()).toEqual([ "Alpha", "Beta", "Gamma" ]);
    });

    // #region The card, and what the test does to it

    let captured: number[];

    function draw(props: Partial<Parameters<typeof SortableCard>[0]> = {}) {
        if (container) {
            render(null, container);
            container.remove();
        }

        container = document.createElement("div");
        document.body.appendChild(container);
        captured = [];

        redraw(items, props);
    }

    function redraw(
        order: SortableItem[], props: Partial<Parameters<typeof SortableCard>[0]> = {}
    ) {
        act(() => {
            render(
                <SortableCard
                    heading="Order"
                    description="Put them as you like."
                    items={order}
                    onChange={(next) => changed.push(next)}
                    {...props}
                />,
                container);
        });

        lay();
    }

    /**
     * Tells the segments where they stand, which happy-dom lays nothing out to work out for itself.
     *
     * Answered from where a segment stands among its siblings at the moment it is asked, rather
     * than from a number written once: the card reads these back the instant it has put a segment
     * elsewhere, and a browser would have laid the list out again by then.
     */
    function lay() {
        const element = list();
        if (!element) {
            return;
        }

        element.setPointerCapture = (pointerId: number) => { captured.push(pointerId); };
        element.getBoundingClientRect ??= () => new DOMRect(0, 0, 300, 0);
        element.releasePointerCapture = () => {};
        Object.defineProperty(element, "clientHeight", {
            get: () => segments().length * (SEGMENT_HEIGHT + SEGMENT_GAP) - SEGMENT_GAP,
            configurable: true
        });

        for (const segment of [ ...segments(), row() ]) {
            if (!segment) {
                continue;
            }

            Object.defineProperty(segment, "offsetTop", {
                get() {
                    const place = [ ...(this.parentElement?.children ?? []) ].indexOf(this);
                    return place * (SEGMENT_HEIGHT + SEGMENT_GAP);
                },
                configurable: true
            });
            Object.defineProperty(segment, "offsetHeight", {
                get: () => SEGMENT_HEIGHT, configurable: true
            });
        }
    }

    function list() {
        return container.querySelector<HTMLElement>(".tn-sortable-list");
    }

    /** Where the list stands on screen, which the scrolling of whatever holds it moves. */
    function standAt(top: number) {
        const element = list();
        if (element) {
            element.getBoundingClientRect = () => new DOMRect(0, top, 300, listHeight());
        }
    }

    function row() {
        return container.querySelector<HTMLElement>(".tn-sortable-adders");
    }

    /** The first of the buttons at the foot of the card, there being at least one in these. */
    function adder() {
        return container.querySelector<HTMLElement>(".tn-sortable-adder");
    }

    function adders() {
        return [ ...container.querySelectorAll<HTMLElement>(".tn-sortable-adder") ];
    }

    /** A way of making one entry, named so a test can tell which button made what. */
    function makes(key: string, caption: string, label = "Add") {
        return { label, onCreateItem: () => ({ key, caption }) };
    }

    function segments() {
        return [ ...container.querySelectorAll<HTMLElement>(".tn-sortable-segment") ];
    }

    function segmentOf(key: string) {
        return container.querySelector<HTMLElement>(`.tn-sortable-segment[data-key="${key}"]`);
    }

    function captions() {
        return segments().map((segment) => segment.textContent?.trim());
    }

    function listHeight() {
        return list()?.clientHeight ?? 0;
    }

    /** How far a carried segment stands from where the list would otherwise have put it. */
    function shift(segment: HTMLElement | null) {
        const by = Number(/translateY\((-?[\d.]+)px\)/.exec(segment?.style.transform ?? "")?.[1]);
        return (segment?.offsetTop ?? 0) + (Number.isNaN(by) ? 0 : by);
    }

    /** A finger going down on a segment, which takes nothing up until it has rested there. */
    function touch(segment: HTMLElement | null, { onGrip = true } = {}) {
        grab(segment, 0, { pointerType: "touch", button: -1 }, onGrip);
    }

    /** Whether a finger moving now would still scroll the page rather than carry a segment. */
    function scrolls() {
        const move = new Event("touchmove", { bubbles: true, cancelable: true });
        act(() => { list()?.dispatchEvent(move); });
        return !move.defaultPrevented;
    }

    /** Waits out the rest a finger has to keep before the segment follows it. */
    function rest() {
        act(() => { vi.advanceTimersByTime(TOUCH_HOLD + 10); });
        lay();
    }

    function grab(
        segment: HTMLElement | null, at = 0, options: Record<string, unknown> = {}, onGrip = true
    ) {
        grabbedAt = at;
        grabbedFrom = segment?.offsetTop ?? 0;
        const pressed = onGrip ? segment?.querySelector(".tn-sortable-grip") : segment;
        act(() => { pressed?.dispatchEvent(pointerEvent("pointerdown", at, options)); });
        lay();
    }

    /** Carries the held segment until its head stands at `top`, wherever it was taken from. */
    function moveTo(top: number, options: Record<string, unknown> = {}) {
        act(() => {
            list()?.dispatchEvent(
                pointerEvent("pointermove", grabbedAt + (top - grabbedFrom), options));
        });
        lay();
    }

    function drop() {
        act(() => { list()?.dispatchEvent(pointerEvent("pointerup", 0)); });
        lay();
    }

    let grabbedAt = 0;
    let grabbedFrom = 0;

    function pointerEvent(type: string, clientY: number, options: Record<string, unknown> = {}) {
        const event = new Event(type, { bubbles: true, cancelable: true });
        for (const [ name, value ] of Object.entries({
            clientY, clientX: 0, pointerId: 1, button: 0, pointerType: "mouse", ...options
        })) {
            Object.defineProperty(event, name, { value, configurable: true });
        }
        return event;
    }

    function press(target: Element | null, key: string, options: KeyboardEventInit = {}) {
        act(() => {
            target?.dispatchEvent(
                new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }));
        });
        lay();
    }

    function focus(target: HTMLElement | null) {
        act(() => {
            target?.focus();
            target?.dispatchEvent(new FocusEvent("focus", { bubbles: false }));
        });
    }

    async function click(target: HTMLElement | null) {
        await act(async () => {
            target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        lay();
    }

    // #endregion
});
