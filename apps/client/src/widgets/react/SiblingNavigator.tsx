import "./SiblingNavigator.css";

import type { RefObject } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import type NoteContext from "../../components/note_context";
import type FNote from "../../entities/fnote";
import froca from "../../services/froca";
import { t } from "../../services/i18n";
import { isMobile } from "../../services/utils";
import { useStaticTooltip, useTriliumEvent } from "./hooks";
import { codeToSiblingDirection, getParentFromNotePath, getSiblingNavigation, isTextEntryTarget } from "./sibling_navigation";

const NO_KEYS: readonly string[] = [];

interface SiblingNavigatorProps {
    note?: FNote;
    noteContext?: NoteContext;
    /** Match siblings of this type; defaults to the current note's type. */
    siblingType?: string;
    /** Render inert buttons (e.g. when the viewer is reused for an attachment preview). */
    disabled?: boolean;
    /** i18n key for the previous-button tooltip; receives the target note's title as `{{title}}`. */
    previousTooltip: string;
    /** i18n key for the next-button tooltip; receives the target note's title as `{{title}}`. */
    nextTooltip: string;
    /**
     * Optional element to scope keyboard navigation to: keys act only while focus is inside it. When
     * omitted, navigation is scoped to the active tab/pane instead, so it works without any wiring.
     */
    keyboardTarget?: RefObject<HTMLElement | null>;
    /** Extra `KeyboardEvent.code`s that trigger previous/next, on top of PageUp/PageDown. */
    extraPreviousKeys?: readonly string[];
    extraNextKeys?: readonly string[];
}

interface SiblingNavigationState {
    index: number;
    total: number;
    previousTitle: string;
    nextTitle: string;
    navigatePrevious: () => void;
    navigateNext: () => void;
    navigateFirst: () => void;
    navigateLast: () => void;
}

/**
 * Computes prev/next navigation among the current note's same-type siblings within the parent of the
 * current tab (clone-aware), exposing the target notes' titles. Pass `siblingType` to match a different
 * type. Reusable for any note type; returns null when there is nothing to navigate. Served from froca.
 */
export function useSiblingNavigation(note: FNote | undefined, noteContext: NoteContext | undefined, siblingType?: string): SiblingNavigationState | null {
    const notePath = noteContext?.notePath;
    const type = siblingType ?? note?.type;
    const [ siblings, setSiblings ] = useState<{ noteId: string; title: string }[]>([]);
    const [ refreshCounter, setRefreshCounter ] = useState(0);

    useEffect(() => {
        const parent = getParentFromNotePath(notePath);
        if (!parent || !type) {
            setSiblings([]);
            return;
        }

        let active = true;
        void froca.getNote(parent.parentNoteId)
            .then((parentNote) => parentNote?.getChildNotes() ?? [])
            .then((children) => {
                if (active) setSiblings(children.filter((child) => child.type === type).map((child) => ({ noteId: child.noteId, title: child.title })));
            });
        return () => { active = false; };
    }, [ notePath, type, refreshCounter ]);

    useTriliumEvent("entitiesReloaded", ({ loadResults }) => {
        const parent = getParentFromNotePath(notePath);
        if (!parent) return;
        const branchesChanged = loadResults.getBranchRows().some((branch) => branch.parentNoteId === parent.parentNoteId);
        const siblingChanged = loadResults.getNoteIds().some((noteId) => siblings.some((sibling) => sibling.noteId === noteId));
        if (branchesChanged || siblingChanged) setRefreshCounter((counter) => counter + 1);
    });

    const parent = getParentFromNotePath(notePath);
    if (!note || !parent) return null;
    const navigation = getSiblingNavigation(siblings.map((sibling) => sibling.noteId), note.noteId);
    if (!navigation) return null;

    const titleOf = (noteId: string) => siblings.find((sibling) => sibling.noteId === noteId)?.title ?? "";
    const navigateTo = (noteId: string) => void noteContext?.setNote(`${parent.parentPath}/${noteId}`);
    return {
        index: navigation.index,
        total: navigation.total,
        previousTitle: titleOf(navigation.previous),
        nextTitle: titleOf(navigation.next),
        navigatePrevious: () => navigateTo(navigation.previous),
        navigateNext: () => navigateTo(navigation.next),
        navigateFirst: () => navigateTo(navigation.first),
        navigateLast: () => navigateTo(navigation.last)
    };
}

/**
 * Floating previous/next navigation between a note's same-type siblings (within the current tab's
 * parent), with a "<index>/<total>" indicator and tooltips naming the target note. The tooltip text
 * comes from the caller-provided i18n keys (`previousTooltip`/`nextTooltip`), so each note type can
 * phrase it ("Previous image: …", "Previous video: …"). Renders nothing when there is no sibling to
 * move between — unless `disabled`, which shows the buttons in an inert state.
 */
export default function SiblingNavigator({ note, noteContext, siblingType, disabled, previousTooltip, nextTooltip, keyboardTarget, extraPreviousKeys = NO_KEYS, extraNextKeys = NO_KEYS }: SiblingNavigatorProps) {
    const previousRef = useRef<HTMLButtonElement>(null);
    const nextRef = useRef<HTMLButtonElement>(null);

    const navigation = useSiblingNavigation(note, noteContext, siblingType);
    useSiblingKeyboard(disabled ? null : navigation, noteContext, keyboardTarget, extraPreviousKeys, extraNextKeys);

    const previousText = navigation ? t(previousTooltip, { title: navigation.previousTitle }) : "";
    const nextText = navigation ? t(nextTooltip, { title: navigation.nextTitle }) : "";
    // Memoize so the bootstrap tooltip is only recreated when the target note's name actually changes.
    const previousConfig = useMemo(() => ({ title: previousText, placement: "bottom" as const }), [ previousText ]);
    const nextConfig = useMemo(() => ({ title: nextText, placement: "bottom" as const }), [ nextText ]);
    useStaticTooltip(previousRef, previousConfig);
    useStaticTooltip(nextRef, nextConfig);

    if (isMobile() || (!disabled && !navigation)) return null;

    return (
        <div className="sibling-navigator">
            <button
                ref={previousRef}
                className="icon-action bx bx-chevron-left"
                disabled={disabled}
                onClick={() => navigation?.navigatePrevious()}
            />
            {navigation && <span className="sibling-navigator-index">{navigation.index}/{navigation.total}</span>}
            <button
                ref={nextRef}
                className="icon-action bx bx-chevron-right"
                disabled={disabled}
                onClick={() => navigation?.navigateNext()}
            />
        </div>
    );
}

/**
 * Drives sibling navigation from the keyboard. A single document-level listener (stable across the
 * viewer remounting on each navigation) maps PageUp/PageDown — plus any caller-provided extra keys —
 * to previous/next. It acts only when a `keyboardTarget` (if given) holds focus, otherwise when the
 * note context is the active tab/pane, and never while the user is typing in a text field.
 */
function useSiblingKeyboard(
    navigation: SiblingNavigationState | null,
    noteContext: NoteContext | undefined,
    keyboardTarget: RefObject<HTMLElement | null> | undefined,
    extraPreviousKeys: readonly string[],
    extraNextKeys: readonly string[]
) {
    // Read the freshest values from inside the listener without re-attaching it on every change.
    const stateRef = useRef({ navigation, noteContext, keyboardTarget, extraPreviousKeys, extraNextKeys });
    stateRef.current = { navigation, noteContext, keyboardTarget, extraPreviousKeys, extraNextKeys };

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;

            const { navigation, noteContext, keyboardTarget, extraPreviousKeys, extraNextKeys } = stateRef.current;
            if (!navigation || isTextEntryTarget(e.target as Element | null)) return;
            if (keyboardTarget) {
                if (!keyboardTarget.current?.contains(document.activeElement)) return;
            } else if (noteContext && !noteContext.isActive()) {
                return;
            }

            const direction = codeToSiblingDirection(e.code, extraPreviousKeys, extraNextKeys);
            if (!direction) return;
            e.preventDefault();
            if (direction === "previous") navigation.navigatePrevious();
            else if (direction === "next") navigation.navigateNext();
            else if (direction === "first") navigation.navigateFirst();
            else navigation.navigateLast();
        };

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, []);
}
