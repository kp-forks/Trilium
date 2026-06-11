import "./index.css";
import "gridstack/dist/gridstack.min.css";

import { clsx } from "clsx";
import { GridStack } from "gridstack";
import { RefObject, TargetedMouseEvent } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import FNote from "../../../entities/fnote";
import branches from "../../../services/branches";
import froca from "../../../services/froca";
import { t } from "../../../services/i18n";
import CollectionProperties from "../../note_bars/CollectionProperties";
import ActionButton from "../../react/ActionButton";
import { useElementSize, useNoteLabelBoolean, useNoteTreeDrag, useSpacedUpdate } from "../../react/hooks";
import Icon from "../../react/Icon";
import NoteLink from "../../react/NoteLink";
import { ViewModeProps } from "../interface";
import { getNotePath, NoteContent } from "../legacy/ListOrGridView";
import openWidgetContextMenu from "./context_menu";

interface DashboardWidgetLayout {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface DashboardViewConfig {
    widgets?: Record<string, DashboardWidgetLayout>;
}

const DEFAULT_WIDGET_SIZE = { w: 4, h: 3 };
const INITIALIZED_CLASS = "dashboard-widget-initialized";
const GRID_COLUMNS = 12;
/** Below this container width (in pixels) the dashboard collapses to a single column. */
const SINGLE_COLUMN_BREAKPOINT = 768;

export default function DashboardView({ note, noteIds, viewConfig, saveConfig, highlightedTokens, showTextRepresentation }: ViewModeProps<DashboardViewConfig>) {
    const [ notes, setNotes ] = useState<FNote[]>([]);
    const [ includeArchived ] = useNoteLabelBoolean(note, "includeArchived");
    const containerRef = useRef<HTMLDivElement>(null);
    // The grid only spans its content height, so drops land on the taller scroll container instead.
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<GridStack | null>(null);
    // Gridstack becomes the source of truth for geometry after init; capture the saved layout once
    // since the viewConfig prop changes identity after every save.
    const savedWidgetsRef = useRef(viewConfig?.widgets ?? {});
    const pendingConfigRef = useRef<DashboardViewConfig | null>(null);
    // Dropping a note from the note tree clones it into the dashboard; the returned ref holds the
    // drop positions of those new notes, consumed by the reconcile effect below.
    const dropPositionsRef = useNoteTreeDropToDashboard(note, scrollContainerRef, containerRef, gridRef);
    const spacedUpdate = useSpacedUpdate(() => {
        if (pendingConfigRef.current) {
            saveConfig(pendingConfigRef.current);
            pendingConfigRef.current = null;
        }
    });

    useEffect(() => {
        froca.getNotes(noteIds).then(setNotes);
    }, [ noteIds ]);

    // Dragging and resizing don't work meaningfully in the collapsed single-column mode
    // (the rearrangement would not be persisted anyway), so disable them entirely there.
    const containerSize = useElementSize(containerRef);
    const isCollapsed = (containerSize?.width ?? Number.POSITIVE_INFINITY) < SINGLE_COLUMN_BREAKPOINT;
    useEffect(() => {
        gridRef.current?.setStatic(isCollapsed);
    }, [ isCollapsed ]);

    function persistLayout(grid: GridStack) {
        if (grid.getColumn() !== GRID_COLUMNS) {
            // Collapsed responsive mode — the geometry is a derived single-column layout;
            // persisting it would overwrite the real one.
            return;
        }

        const widgets: Record<string, DashboardWidgetLayout> = {};
        for (const node of grid.engine.nodes) {
            if (typeof node.id === "string") {
                widgets[node.id] = { x: node.x ?? 0, y: node.y ?? 0, w: node.w ?? 1, h: node.h ?? 1 };
            }
        }
        if (sameLayout(widgets, savedWidgetsRef.current)) {
            return;
        }
        savedWidgetsRef.current = widgets;
        pendingConfigRef.current = { widgets };
        spacedUpdate.scheduleUpdate();
    }

    // Initialize the grid once per parent note.
    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const grid = GridStack.init({
            column: GRID_COLUMNS,
            cellHeight: 80,
            margin: 8,
            float: true,
            handle: ".dashboard-widget-header",
            columnOpts: {
                // Collapse to a vertical stack when the dashboard itself gets narrow,
                // covering both mobile devices and narrow splits on desktop.
                breakpoints: [{ w: SINGLE_COLUMN_BREAKPOINT, c: 1 }]
            }
        }, container);
        gridRef.current = grid;
        grid.on("change", () => persistLayout(grid));

        return () => {
            grid.destroy(false);
            gridRef.current = null;
        };
    }, [ note ]);

    // Reconcile the rendered children with the gridstack engine: Preact owns the element lifecycle
    // (keyed by noteId), gridstack owns the geometry.
    useLayoutEffect(() => {
        const grid = gridRef.current;
        const container = containerRef.current;
        if (!grid || !container) return;

        let changed = false;
        grid.batchUpdate();
        try {
            // Drop engine nodes whose element Preact has already unmounted.
            for (const node of [ ...grid.engine.nodes ]) {
                if (node.el && !node.el.isConnected) {
                    grid.removeWidget(node.el, false, false);
                    changed = true;
                }
            }

            // Promote newly rendered items to widgets, restoring their saved geometry.
            for (const el of container.querySelectorAll<HTMLElement>(`.grid-stack-item:not(.${INITIALIZED_CLASS})`)) {
                const noteId = el.dataset.noteId;
                if (!noteId) continue;
                const saved = dropPositionsRef.current[noteId] ?? savedWidgetsRef.current[noteId];
                delete dropPositionsRef.current[noteId];
                grid.makeWidget(el, {
                    id: noteId,
                    ...DEFAULT_WIDGET_SIZE,
                    ...saved,
                    autoPosition: !saved
                });
                el.classList.add(INITIALIZED_CLASS);
                changed = true;
            }
        } finally {
            grid.batchUpdate(false);
        }

        // Persist auto-assigned positions and prune entries of removed notes — but only when
        // reconciliation actually touched the grid. Running on an empty grid (e.g. before the
        // notes have loaded on mount) would otherwise save an empty layout over the real one.
        if (changed) {
            persistLayout(grid);
        }
    }, [ notes ]);

    // React to external changes of the layout (e.g. the same dashboard open in another split
    // or synced from another instance) propagated through the viewConfig prop.
    useEffect(() => {
        const widgets = viewConfig?.widgets ?? {};
        if (pendingConfigRef.current || sameLayout(widgets, savedWidgetsRef.current)) {
            // Local changes take precedence; identical layouts (e.g. our own save echoing back)
            // need no re-apply.
            return;
        }
        savedWidgetsRef.current = widgets;
        applyLayout(widgets);
    }, [ viewConfig ]);

    function applyLayout(widgets: Record<string, DashboardWidgetLayout>) {
        const grid = gridRef.current;
        const container = containerRef.current;
        if (!grid || !container) return;
        if (grid.getColumn() !== GRID_COLUMNS) {
            // Collapsed responsive mode — the full-width coordinates don't apply to the derived
            // single-column layout. savedWidgetsRef is already updated, so the next save from this
            // side won't overwrite the external change.
            return;
        }

        grid.batchUpdate();
        try {
            for (const el of container.querySelectorAll<HTMLElement>(`.grid-stack-item.${INITIALIZED_CLASS}`)) {
                const layout = el.dataset.noteId ? widgets[el.dataset.noteId] : undefined;
                if (layout) {
                    grid.update(el, layout);
                }
            }
        } finally {
            grid.batchUpdate(false);
        }
    }

    return (
        <div className="dashboard-view">
            <CollectionProperties note={note} />
            <div className="dashboard-scroll-container" ref={scrollContainerRef}>
                <div className="grid-stack" ref={containerRef}>
                    {notes.map((childNote) => (
                        <DashboardWidget
                            key={childNote.noteId}
                            note={childNote}
                            parentNote={note}
                            highlightedTokens={highlightedTokens}
                            includeArchived={includeArchived}
                            showTextRepresentation={showTextRepresentation}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Wire up dropping notes from the note tree onto the dashboard: each dropped note is cloned into
 *  the dashboard and the first one is positioned under the cursor. Returns a ref holding the drop
 *  positions of the freshly cloned notes, which the reconcile effect consumes (once) when it
 *  promotes them to grid widgets — kept out of savedWidgetsRef so persistLayout still saves them. */
function useNoteTreeDropToDashboard(note: FNote, dropAreaRef: RefObject<HTMLDivElement>, gridContainerRef: RefObject<HTMLDivElement>, gridRef: RefObject<GridStack | null>) {
    const dropPositionsRef = useRef<Record<string, DashboardWidgetLayout>>({});

    useNoteTreeDrag(dropAreaRef, {
        dragEnabled: true,
        dragNotEnabledMessage: {
            icon: "bx bx-lock-alt",
            title: t("book.drag_locked_title"),
            message: t("book.drag_locked_message")
        },
        async callback(treeData, e) {
            const grid = gridRef.current;
            const gridContainer = gridContainerRef.current;
            if (!grid || !gridContainer) return;

            const dropCell = computeDropCell(grid, gridContainer, e);
            for (let i = 0; i < treeData.length; i++) {
                const { noteId } = treeData[i];
                const childNote = await froca.getNote(noteId, true);
                if (childNote?.getParentNoteIds().includes(note.noteId)) {
                    // Already a widget on this dashboard — don't create a duplicate clone.
                    continue;
                }
                // Place the first dropped note under the cursor; let the rest auto-position so they
                // don't all stack on the same cell.
                if (i === 0 && dropCell) {
                    dropPositionsRef.current[noteId] = { ...DEFAULT_WIDGET_SIZE, ...dropCell };
                }
                await branches.cloneNoteToParentNote(noteId, note.noteId);
            }
        }
    });

    return dropPositionsRef;
}

interface DashboardWidgetProps {
    note: FNote;
    parentNote: FNote;
    highlightedTokens: string[] | null | undefined;
    includeArchived: boolean;
    showTextRepresentation?: boolean;
}

function DashboardWidget({ note, parentNote, highlightedTokens, includeArchived, showTextRepresentation }: DashboardWidgetProps) {
    const notePath = getNotePath(parentNote, note);
    // Bumping the key remounts NoteContent, which re-runs the render — only meaningful for render notes.
    const [ refreshKey, setRefreshKey ] = useState(0);
    const isRenderNote = note.type === "render";

    /* The outer .grid-stack-item class list must stay constant across renders so that Preact never
       clobbers the classes gridstack adds there; dynamic classes go on the inner content element. */
    return (
        <div className="grid-stack-item" data-note-id={note.noteId}>
            <div className={clsx("grid-stack-item-content", "dashboard-widget", "no-tooltip-preview", note.getColorClass(), {
                "archived": note.isArchived
            })}>
                <div className="dashboard-widget-header">
                    <Icon className="note-icon" icon={note.getIcon()} />
                    <NoteLink className="note-book-title"
                        notePath={notePath}
                        noPreview
                        highlightedTokens={highlightedTokens} />
                    <ActionButton className="note-book-item-menu"
                        icon="bx bx-dots-vertical-rounded" text=""
                        onClick={(e: TargetedMouseEvent<HTMLElement>) => {
                            openWidgetContextMenu(notePath, note.parentToBranch[parentNote.noteId], e, {
                                onRefresh: isRenderNote ? () => setRefreshKey((key) => key + 1) : undefined
                            });
                            e.stopPropagation();
                        }} />
                </div>
                <div className="dashboard-widget-content">
                    <NoteContent key={refreshKey}
                        note={note}
                        trim
                        highlightedTokens={highlightedTokens}
                        includeArchivedNotes={includeArchived}
                        showTextRepresentation={showTextRepresentation} />
                </div>
            </div>
        </div>
    );
}

/** Translate a drop event's viewport coordinates into a grid cell, or null when auto-positioning
 *  is preferable (the grid is in collapsed single-column mode or has no measurable geometry yet). */
function computeDropCell(grid: GridStack, container: HTMLElement, e: DragEvent): Pick<DashboardWidgetLayout, "x" | "y"> | null {
    if (grid.getColumn() !== GRID_COLUMNS) {
        return null;
    }
    const rect = container.getBoundingClientRect();
    const cellWidth = rect.width / GRID_COLUMNS;
    const cellHeight = grid.getCellHeight();
    if (!cellWidth || !cellHeight) {
        return null;
    }
    const x = Math.min(GRID_COLUMNS - DEFAULT_WIDGET_SIZE.w, Math.max(0, Math.floor((e.clientX - rect.left) / cellWidth)));
    const y = Math.max(0, Math.floor((e.clientY - rect.top) / cellHeight));
    return { x, y };
}

function sameLayout(a: Record<string, DashboardWidgetLayout>, b: Record<string, DashboardWidgetLayout>) {
    const aKeys = Object.keys(a);
    if (aKeys.length !== Object.keys(b).length) {
        return false;
    }
    return aKeys.every((key) => {
        const other = b[key];
        return other && a[key].x === other.x && a[key].y === other.y && a[key].w === other.w && a[key].h === other.h;
    });
}
