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
    const manualStackRef = useRef(false);

    // Sync stack with the active note path unless the user has manually drilled.
    useEffect(() => {
        if (manualStackRef.current) return;
        const newStack = buildStackForActiveNote(activeNotePath, effectiveHoistedId);
        setStack(newStack);
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

    const goBack = useCallback(() => {
        manualStackRef.current = true;
        setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    }, []);

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

    const drillInto = useCallback((childNotePath: string) => {
        manualStackRef.current = true;
        setStack((prev) => [...prev, childNotePath]);
    }, []);

    const isCurrentActive = !!activeNoteId && activeNoteId === currentParentId;

    return (
        <div className="mobile-note-navigator">
            <div className="mobile-navigator-toolbar">
                <ActionButton
                    className={clsx("mobile-navigator-back", !canGoBack && "invisible")}
                    icon="bx bx-chevron-left"
                    text={t("mobile_note_navigator.back")}
                    onClick={canGoBack ? goBack : undefined}
                    disabled={!canGoBack}
                />
            </div>

            <div className="mobile-navigator-scroll">
                <div
                    className={clsx("mobile-navigator-current-tile", {
                        "is-active": isCurrentActive,
                        "is-archived": parentNote?.isArchived
                    })}
                    role="button"
                    tabIndex={0}
                    onClick={openCurrent}
                >
                    <div className="mobile-navigator-current-header">
                        <Icon icon={parentIcon ?? "bx bx-folder"} className="mobile-navigator-current-icon" />
                        <span className="mobile-navigator-current-title">
                            {parentNote?.title ?? t("mobile_note_navigator.loading")}
                        </span>
                        <Icon icon="bx bx-link-external" className="mobile-navigator-current-open" />
                    </div>
                    {parentNote && (
                        <div className="mobile-navigator-current-preview">
                            <NoteContent
                                note={parentNote}
                                trim
                                noChildrenList
                                highlightedTokens={null}
                                includeArchivedNotes={!hideArchived}
                            />
                        </div>
                    )}
                </div>

                <div className="mobile-navigator-list">
                    {!isLoaded ? (
                        <NoItems icon="bx bx-loader" text={t("mobile_note_navigator.loading")} />
                    ) : children.length === 0 ? (
                        <NoItems icon="bx bx-folder-open" text={t("mobile_note_navigator.empty")} />
                    ) : (
                        children.map((child) => (
                            <NavigatorRow
                                key={child.branchId}
                                note={child.note}
                                prefix={child.prefix}
                                childNotePath={`${currentParentPath}/${child.note.noteId}`}
                                isActive={child.note.noteId === activeNoteId}
                                onDrill={drillInto}
                                onOpen={openNotePath}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

interface NavigatorRowProps {
    note: FNote;
    prefix?: string;
    childNotePath: string;
    isActive: boolean;
    onDrill: (notePath: string) => void;
    onOpen: (notePath: string) => void;
}

function NavigatorRow({ note, prefix, childNotePath, isActive, onDrill, onOpen }: NavigatorRowProps) {
    const icon = useNoteIcon(note);
    const hasChildren = note.hasChildren();
    const colorClass = note.getColorClass();
    const title = prefix ? `${prefix} - ${note.title}` : note.title;

    return (
        <div
            className={clsx("mobile-navigator-row", colorClass, {
                "is-active": isActive,
                "is-archived": note.isArchived,
                "has-children": hasChildren
            })}
            role="button"
            tabIndex={0}
            onClick={() => (hasChildren ? onDrill(childNotePath) : onOpen(childNotePath))}
        >
            <Icon icon={icon ?? "bx bx-note"} className="mobile-navigator-row-icon" />
            <span className="mobile-navigator-row-title">{title}</span>
            {hasChildren && <Icon icon="bx bx-chevron-right" className="mobile-navigator-row-chevron" />}
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
