import "./MobileNoteNavigator.css";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";

import type FNote from "../../entities/fnote";
import froca from "../../services/froca";
import { t } from "../../services/i18n";
import { NoteContent } from "../collections/legacy/ListOrGridView";
import ActionButton from "../react/ActionButton";
import {
    useActiveNoteContext,
    useNote,
    useNoteIcon,
    useTriliumEvent,
    useTriliumOptionBool
} from "../react/hooks";
import Icon from "../react/Icon";
import NoItems from "../react/NoItems";

/**
 * A touch-native replacement for the Fancytree-based note tree on mobile. Shows one
 * "column" of children at a time (iOS Files / macOS Finder style): the column's
 * current note is rendered at the top with a content preview and opens on tap,
 * while tapping child rows drills deeper without navigating.
 */
export default function MobileNoteNavigator() {
    const { notePath: activeNotePath, hoistedNoteId, noteContext, parentComponent } = useActiveNoteContext();
    const [hideArchived] = useTriliumOptionBool("hideArchivedNotes_main");

    const effectiveHoistedId = hoistedNoteId ?? "root";
    const [stack, setStack] = useState<string[]>([effectiveHoistedId]);
    // When set, a stack we want to navigate to. We render a hidden NoteContent for its
    // target to preload the preview, then commit the stack once the preview is ready.
    // This keeps the previously-committed view visible during drill/back transitions
    // so there's no placeholder flash.
    const [nextStack, setNextStack] = useState<string[] | null>(null);
    const manualStackRef = useRef(false);

    // Sync stack with the active note path unless the user has manually drilled.
    useEffect(() => {
        if (manualStackRef.current) return;
        const newStack = buildStackForActiveNote(activeNotePath, effectiveHoistedId);
        setStack(newStack);
        setNextStack(null);
    }, [activeNotePath, effectiveHoistedId]);

    // Rebuild when Froca reports structural changes that could affect the current column.
    useTriliumEvent("entitiesReloaded", ({ loadResults }) => {
        const parentPath = stack[stack.length - 1];
        const parentNoteId = getLastSegment(parentPath);
        if (loadResults.getBranchRows().some((b) => b.parentNoteId === parentNoteId)) {
            setStack((prev) => [...prev]);
        }
    });

    const currentParentPath = stack[stack.length - 1];
    const currentParentId = getLastSegment(currentParentPath);
    const parentNote = useNote(currentParentId);
    const parentIcon = useNoteIcon(parentNote);
    const activeNoteId = activeNotePath ? getLastSegment(activeNotePath) : undefined;

    const pendingPath = nextStack?.[nextStack.length - 1];
    const pendingId = pendingPath ? getLastSegment(pendingPath) : undefined;
    const pendingNote = useNote(pendingId);
    const pendingChildId = nextStack && nextStack.length > stack.length ? pendingId : undefined;
    const pendingPop = !!nextStack && nextStack.length < stack.length;

    // Froca's initial `tree` response only returns the top of the tree; deeper levels are
    // normally pulled in by Fancytree's lazy-load. The navigator doesn't use Fancytree,
    // so we pull the subtree ourselves whenever the current parent changes.
    const [loadedParents, setLoadedParents] = useState<Set<string>>(() => new Set());
    useEffect(() => {
        if (!currentParentId || loadedParents.has(currentParentId)) return;
        let cancelled = false;
        froca.loadSubTree(currentParentId).then(() => {
            if (cancelled) return;
            setLoadedParents((prev) => {
                if (prev.has(currentParentId)) return prev;
                const next = new Set(prev);
                next.add(currentParentId);
                return next;
            });
        });
        return () => {
            cancelled = true;
        };
    }, [currentParentId, loadedParents]);

    const isLoaded = !!currentParentId && loadedParents.has(currentParentId);
    const children = useNavigatorChildren(parentNote, hideArchived, isLoaded);
    const canGoBack = stack.length > 1;

    // Gate the visible body on the content preview being ready to avoid a layout shift
    // when the preview finishes rendering. Tied to the parent's noteId so a stale "ready"
    // flag from the previous column can't leak into the new one.
    const [readyForNoteId, setReadyForNoteId] = useState<string | null>(null);
    const previewReady = !!parentNote && readyForNoteId === parentNote.noteId;
    const bodyVisible = previewReady && isLoaded;
    const onPreviewReady = useCallback(() => {
        if (parentNote) setReadyForNoteId(parentNote.noteId);
    }, [parentNote]);

    // Full-screen spinner only for the very first render — once a body has been shown,
    // subsequent navigations swap views without a global placeholder.
    const hasCommittedOnceRef = useRef(false);
    if (bodyVisible) hasCommittedOnceRef.current = true;
    const showInitialLoader = !bodyVisible && !hasCommittedOnceRef.current;

    // Preload state for the pending stack target. Once ready, commit the stack change.
    const [nextReadyNoteId, setNextReadyNoteId] = useState<string | null>(null);
    const onPendingReady = useCallback(() => {
        if (pendingNote) setNextReadyNoteId(pendingNote.noteId);
    }, [pendingNote]);

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!nextStack || !pendingId || nextReadyNoteId !== pendingId) return;
        setStack(nextStack);
        setReadyForNoteId(pendingId);
        setNextStack(null);
        setNextReadyNoteId(null);
        // Reset scroll so the committed tile is visible at the top of the column.
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [nextStack, pendingId, nextReadyNoteId]);

    const navigateTo = useCallback(
        (newStack: string[]) => {
            if (hasCommittedOnceRef.current) {
                setNextStack(newStack);
            } else {
                setStack(newStack);
            }
        },
        []
    );

    const goBack = useCallback(() => {
        if (stack.length <= 1) return;
        manualStackRef.current = true;
        navigateTo(stack.slice(0, -1));
    }, [stack, navigateTo]);

    const openNotePath = useCallback(
        async (notePath: string) => {
            await noteContext?.setNote(notePath);
            manualStackRef.current = false;
            parentComponent?.triggerCommand("setActiveScreen", { screen: "detail" });
        },
        [noteContext, parentComponent]
    );

    const openCurrent = useCallback(() => {
        if (!currentParentPath) return;
        openNotePath(currentParentPath);
    }, [currentParentPath, openNotePath]);

    const drillInto = useCallback(
        (childNotePath: string) => {
            manualStackRef.current = true;
            navigateTo([...stack, childNotePath]);
        },
        [stack, navigateTo]
    );

    const isCurrentActive = !!activeNoteId && activeNoteId === currentParentId;

    return (
        <div className="mobile-note-navigator">
            <div className="mobile-navigator-toolbar">
                <ActionButton
                    className={clsx("mobile-navigator-back", !canGoBack && "invisible")}
                    icon={pendingPop ? "bx bx-loader bx-spin" : "bx bx-chevron-left"}
                    text={t("mobile_note_navigator.back")}
                    onClick={canGoBack && !pendingPop ? goBack : undefined}
                    disabled={!canGoBack || pendingPop}
                />
            </div>

            <div ref={scrollRef} className={clsx("mobile-navigator-scroll", showInitialLoader && "is-pending")}>
                {parentNote && (
                    <div
                        className={clsx("mobile-navigator-current-tile", {
                            "is-active": isCurrentActive,
                            "is-archived": parentNote.isArchived
                        })}
                        role="button"
                        tabIndex={0}
                        onClick={openCurrent}
                    >
                        <div className="mobile-navigator-current-header">
                            <Icon icon={parentIcon ?? "bx bx-folder"} className="mobile-navigator-current-icon" />
                            <span className="mobile-navigator-current-title">{parentNote.title}</span>
                            <Icon icon="bx bx-link-external" className="mobile-navigator-current-open" />
                        </div>
                        <div className="mobile-navigator-current-preview">
                            <NoteContent
                                note={parentNote}
                                trim
                                noChildrenList
                                highlightedTokens={null}
                                includeArchivedNotes={!hideArchived}
                                onReady={onPreviewReady}
                            />
                        </div>
                    </div>
                )}

                <div className="mobile-navigator-list">
                    {!isLoaded || !parentNote ? null : children.length === 0 ? (
                        <NoItems icon="bx bx-folder-open" text={t("mobile_note_navigator.empty")} />
                    ) : (
                        children.map((child) => (
                            <NavigatorRow
                                key={child.branchId}
                                note={child.note}
                                prefix={child.prefix}
                                childNotePath={`${currentParentPath}/${child.note.noteId}`}
                                isActive={child.note.noteId === activeNoteId}
                                isPending={child.note.noteId === pendingChildId}
                                onDrill={drillInto}
                                onOpen={openNotePath}
                            />
                        ))
                    )}
                </div>

                {showInitialLoader && (
                    <div className="mobile-navigator-placeholder">
                        <span className="bx bx-loader bx-spin" />
                    </div>
                )}
            </div>

            {/* Hidden preloader: renders NoteContent for the pending target so we can
                commit the stack change only after its preview is ready. */}
            {pendingNote && (
                <div className="mobile-navigator-preloader" aria-hidden="true">
                    <NoteContent
                        key={pendingNote.noteId}
                        note={pendingNote}
                        trim
                        noChildrenList
                        highlightedTokens={null}
                        includeArchivedNotes={!hideArchived}
                        onReady={onPendingReady}
                    />
                </div>
            )}
        </div>
    );
}

interface NavigatorRowProps {
    note: FNote;
    prefix?: string;
    childNotePath: string;
    isActive: boolean;
    isPending: boolean;
    onDrill: (notePath: string) => void;
    onOpen: (notePath: string) => void;
}

function NavigatorRow({ note, prefix, childNotePath, isActive, isPending, onDrill, onOpen }: NavigatorRowProps) {
    const icon = useNoteIcon(note);
    const hasChildren = note.hasChildren();
    const colorClass = note.getColorClass();
    const title = prefix ? `${prefix} - ${note.title}` : note.title;

    return (
        <div
            className={clsx("mobile-navigator-row", colorClass, {
                "is-active": isActive,
                "is-archived": note.isArchived,
                "is-pending": isPending,
                "has-children": hasChildren
            })}
            role="button"
            tabIndex={0}
            onClick={isPending ? undefined : () => (hasChildren ? onDrill(childNotePath) : onOpen(childNotePath))}
        >
            <Icon icon={icon ?? "bx bx-note"} className="mobile-navigator-row-icon" />
            <span className="mobile-navigator-row-title">{title}</span>
            {isPending ? (
                <Icon icon="bx bx-loader bx-spin" className="mobile-navigator-row-chevron" />
            ) : hasChildren ? (
                <Icon icon="bx bx-chevron-right" className="mobile-navigator-row-chevron" />
            ) : null}
        </div>
    );
}

interface NavigatorChild {
    note: FNote;
    branchId: string;
    prefix?: string;
}

function useNavigatorChildren(parentNote: FNote | null | undefined, hideArchived: boolean, isLoaded: boolean): NavigatorChild[] {
    return useMemo(() => {
        if (!parentNote || !isLoaded) return [];
        const result: NavigatorChild[] = [];
        for (const branch of parentNote.getChildBranches()) {
            if (!branch) continue;
            const note = froca.getNoteFromCache(branch.noteId);
            if (!note) continue;
            if (note.noteId === "_hidden") continue;
            if (hideArchived && note.isArchived) continue;
            result.push({ note, branchId: branch.branchId, prefix: branch.prefix });
        }
        return result;
    }, [parentNote, parentNote?.children?.join(","), hideArchived, isLoaded]);
}

function getLastSegment(notePath: string): string {
    const idx = notePath.lastIndexOf("/");
    return idx >= 0 ? notePath.slice(idx + 1) : notePath;
}

function buildStackForActiveNote(activeNotePath: string | null | undefined, hoistedId: string): string[] {
    if (!activeNotePath) return [hoistedId];

    const segments = activeNotePath.split("/");
    const activeNoteId = segments[segments.length - 1];
    const activeNote = froca.getNoteFromCache(activeNoteId);

    // If the active note is a folder, show its own children; otherwise show its parent's.
    const parentSegments = activeNote?.hasChildren() ? segments : segments.slice(0, -1);

    // Clamp to the hoisted root.
    let start = parentSegments.indexOf(hoistedId);
    if (start < 0) start = 0;
    const clamped = parentSegments.slice(start);
    if (clamped.length === 0) {
        return [hoistedId];
    }

    const stack: string[] = [];
    for (let i = 0; i < clamped.length; i++) {
        stack.push(clamped.slice(0, i + 1).join("/"));
    }
    return stack;
}
