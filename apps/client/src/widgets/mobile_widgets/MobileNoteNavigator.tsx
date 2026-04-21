import "./MobileNoteNavigator.css";

import clsx from "clsx";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";

import appContext from "../../components/app_context";
import type Component from "../../components/component";
import type FNote from "../../entities/fnote";
import contextMenu, { MenuItem } from "../../menus/context_menu";
import NoteColorPicker from "../../menus/custom-items/NoteColorPicker";
import link_context_menu from "../../menus/link_context_menu";
import { TreeCommandNames } from "../../menus/tree_context_menu";
import attributes from "../../services/attributes";
import branches from "../../services/branches";
import froca from "../../services/froca";
import { t } from "../../services/i18n";
import note_create from "../../services/note_create";
import tree from "../../services/tree";
import { NoteContent } from "../collections/legacy/ListOrGridView";
import {
    useActiveNoteContext,
    useLongPressContextMenu,
    useNote,
    useNoteColorClass,
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
    const parentColorClass = useNoteColorClass(parentNote);
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
    const backTargetId = canGoBack ? getLastSegment(stack[stack.length - 2]) : undefined;
    const backTargetNote = useNote(backTargetId);

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
    const bodyRef = useRef<HTMLDivElement>(null);
    const directionRef = useRef<"forward" | "backward" | null>(null);
    const [commitCounter, setCommitCounter] = useState(0);

    useEffect(() => {
        if (!nextStack || !pendingId || nextReadyNoteId !== pendingId) return;
        setStack(nextStack);
        setReadyForNoteId(pendingId);
        setNextStack(null);
        setNextReadyNoteId(null);
        setCommitCounter((c) => c + 1);
        // Reset scroll so the committed tile is visible at the top of the column.
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [nextStack, pendingId, nextReadyNoteId]);

    // Brief slide-in on forward / back so the swap feels directional without blocking the user.
    useLayoutEffect(() => {
        if (commitCounter === 0) return;
        const direction = directionRef.current;
        directionRef.current = null;
        if (!direction || !bodyRef.current) return;
        const offset = direction === "forward" ? "60%" : "-60%";
        bodyRef.current.animate(
            [
                { transform: `translateX(${offset})`, opacity: 0.4 },
                { transform: "translateX(0)", opacity: 1 }
            ],
            { duration: 180, easing: "ease-out" }
        );
    }, [commitCounter]);

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
        directionRef.current = "backward";
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
            directionRef.current = "forward";
            navigateTo([...stack, childNotePath]);
        },
        [stack, navigateTo]
    );

    const isCurrentActive = !!activeNoteId && activeNoteId === currentParentId;

    const currentContextHandler = useMemo(
        () => buildNoteContextMenu(currentParentPath, parentComponent),
        [currentParentPath, parentComponent]
    );
    const currentContextProps = useLongPressContextMenu(currentContextHandler);

    return (
        <div className="mobile-note-navigator">
            <div className="mobile-navigator-toolbar">
                <button
                    type="button"
                    className={clsx("mobile-navigator-back", !canGoBack && "invisible")}
                    onClick={canGoBack && !pendingPop ? goBack : undefined}
                    disabled={!canGoBack || pendingPop}
                    aria-label={t("mobile_note_navigator.back")}
                >
                    <Icon
                        icon={pendingPop ? "bx bx-loader bx-spin" : "bx bx-chevron-left"}
                        className="mobile-navigator-back-icon"
                    />
                    <span className="mobile-navigator-back-title">
                        {backTargetNote?.title ?? ""}
                    </span>
                </button>
            </div>

            <div ref={scrollRef} className={clsx("mobile-navigator-scroll", showInitialLoader && "is-pending")}>
                <div ref={bodyRef} className="mobile-navigator-body">
                    {parentNote && (
                        <div
                            className={clsx("mobile-navigator-current-tile", parentColorClass, {
                                "is-active": isCurrentActive,
                                "is-archived": parentNote.isArchived
                            })}
                            role="button"
                            tabIndex={0}
                            onClick={openCurrent}
                            {...currentContextProps}
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

                    {isLoaded && parentNote && children.length > 0 && (
                        <div className="mobile-navigator-children-label">
                            {t("mobile_note_navigator.children_count", { count: children.length })}
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
                                    parentComponent={parentComponent}
                                />
                            ))
                        )}
                    </div>
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
    parentComponent: Component | null;
}

function NavigatorRow({ note, prefix, childNotePath, isActive, isPending, onDrill, onOpen, parentComponent }: NavigatorRowProps) {
    const icon = useNoteIcon(note);
    const hasChildren = note.hasChildren();
    const colorClass = useNoteColorClass(note);
    const title = prefix ? `${prefix} - ${note.title}` : note.title;
    const contextHandler = useMemo(
        () => buildNoteContextMenu(childNotePath, parentComponent),
        [childNotePath, parentComponent]
    );
    const contextProps = useLongPressContextMenu(contextHandler);

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
            {...contextProps}
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

/**
 * Mirrors the tree / breadcrumb right-click menu: open-in-* actions plus
 * hoist / move / clone / duplicate / archive / delete / color / recent / search.
 */
function buildNoteContextMenu(notePath: string, parentComponent: Component | null) {
    return async (e: MouseEvent) => {
        e.preventDefault();

        const { noteId, parentNoteId } = tree.getNoteIdAndParentIdFromUrl(notePath);
        if (!parentNoteId || !noteId) return;

        const branchId = await froca.getBranchId(parentNoteId, noteId);
        if (!branchId) return;
        const branch = froca.getBranch(branchId);
        if (!branch) return;

        const note = await branch.getNote();
        if (!note) return;

        const notSearch = note.type !== "search";
        const notOptionsOrHelp = !note.noteId.startsWith("_options") && !note.noteId.startsWith("_help");
        const isArchived = note.isArchived;
        const isNotRoot = note.noteId !== "root";
        const isHoisted = note.noteId === appContext.tabManager.getActiveContext()?.hoistedNoteId;
        const parentNote = isNotRoot && branch ? await froca.getNote(branch.parentNoteId) : null;
        const parentNotSearch = !parentNote || parentNote.type !== "search";

        const items = [
            ...link_context_menu.getItems(e),
            {
                title: t("tree-context-menu.hoist-note"),
                command: "toggleNoteHoisting",
                uiIcon: "bx bxs-chevrons-up",
                enabled: notSearch
            },
            { kind: "separator" },
            {
                title: t("tree-context-menu.move-to"),
                command: "moveNotesTo",
                uiIcon: "bx bx-transfer",
                enabled: isNotRoot && !isHoisted && parentNotSearch
            },
            {
                title: t("tree-context-menu.clone-to"),
                command: "cloneNotesTo",
                uiIcon: "bx bx-duplicate",
                enabled: isNotRoot && !isHoisted
            },
            { kind: "separator" },
            {
                title: t("tree-context-menu.duplicate"),
                command: "duplicateSubtree",
                uiIcon: "bx bx-outline",
                enabled: parentNotSearch && isNotRoot && !isHoisted && notOptionsOrHelp && note.isContentAvailable(),
                handler: () => note_create.duplicateSubtree(noteId, branch.parentNoteId)
            },
            {
                title: !isArchived ? t("tree-context-menu.archive") : t("tree-context-menu.unarchive"),
                uiIcon: !isArchived ? "bx bx-archive" : "bx bx-archive-out",
                handler: () => {
                    if (!isArchived) {
                        attributes.addLabel(note.noteId, "archived");
                    } else {
                        attributes.removeOwnedLabelByName(note, "archived");
                    }
                }
            },
            {
                title: t("tree-context-menu.delete"),
                command: "deleteNotes",
                uiIcon: "bx bx-trash destructive-action-icon",
                enabled: isNotRoot && !isHoisted && parentNotSearch && notOptionsOrHelp,
                handler: () => branches.deleteNotes([branchId])
            },
            { kind: "separator" },
            notOptionsOrHelp
                ? {
                    kind: "custom",
                    componentFn: () => NoteColorPicker({ note })
                }
                : null,
            { kind: "separator" },
            {
                title: t("tree-context-menu.recent-changes-in-subtree"),
                uiIcon: "bx bx-history",
                enabled: notOptionsOrHelp,
                handler: () => parentComponent?.triggerCommand("showRecentChanges", { ancestorNoteId: noteId })
            },
            {
                title: t("tree-context-menu.search-in-subtree"),
                command: "searchInSubtree",
                uiIcon: "bx bx-search",
                enabled: notSearch
            }
        ];

        contextMenu.show({
            items: items.filter(Boolean) as MenuItem<TreeCommandNames>[],
            x: e.pageX,
            y: e.pageY,
            selectMenuItemHandler: ({ command }) => {
                if (link_context_menu.handleLinkContextMenuItem(command, e, notePath)) return;
                if (!command) return;
                parentComponent?.triggerCommand(command, {
                    noteId,
                    notePath,
                    selectedOrActiveBranchIds: [branchId],
                    selectedOrActiveNoteIds: [noteId]
                });
            }
        });
    };
}
