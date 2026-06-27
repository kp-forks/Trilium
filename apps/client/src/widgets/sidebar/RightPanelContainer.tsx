//! This is currently only used for the new layout.
import "./RightPanelContainer.css";

import Split from "@triliumnext/split.js";
import { VNode } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import appContext from "../../components/app_context";
import { WidgetsByParent } from "../../services/bundle";
import { t } from "../../services/i18n";
import options from "../../services/options";
import { DEFAULT_GUTTER_SIZE } from "../../services/resizer";
import { isStandalone } from "../../services/utils";
import ActionButton from "../react/ActionButton";
import Button from "../react/Button";
import { useActiveNoteContext, useLegacyWidget, useNoteProperty, useTriliumEvent, useTriliumOptionBool, useTriliumOptionJson } from "../react/hooks";
import LazyComponent from "../react/LazyComponent";
import NoItems from "../react/NoItems";
import LegacyRightPanelWidget from "../right_panel_widget";
import HighlightsList from "./HighlightsList";
import PdfAnnotations from "./pdf/PdfAnnotations";
import PdfAttachments from "./pdf/PdfAttachments";
import PdfLayers from "./pdf/PdfLayers";
import PdfPages from "./pdf/PdfPages";
import RightPaneToggleHandle from "./RightPaneToggleHandle";
import RightPanelWidget from "./RightPanelWidget";
import TableOfContents from "./TableOfContents";

const MIN_WIDTH_PERCENT = 5;
const MAX_WIDTH_PERCENT = 90;

/**
 * - `closed`: hidden. - `docked`: a flex pane that reflows the content (resizable via Split).
 * - `overlay`: floats above the content without reflowing it; transient (closed on focus loss).
 * Only the docked/closed distinction is persisted (`rightPaneVisible`); overlay is runtime-only.
 */
type RightPaneMode = "closed" | "overlay" | "docked";

interface RightPanelWidgetDefinition {
    el: VNode;
    enabled: boolean;
    position?: number;
}

export default function RightPanelContainer({ widgetsByParent }: { widgetsByParent: WidgetsByParent }) {
    const [ mode, setMode ] = useState<RightPaneMode>(() => options.is("rightPaneVisible") ? "docked" : "closed");
    const visible = mode !== "closed";
    const items = useItems(visible, widgetsByParent);
    useSplit(mode);

    // Apply a transition. The state updater stays pure (it can run more than once, e.g. in Strict
    // Mode); persistence is handled in the effect below.
    const apply = useCallback((action: RightPaneAction) => {
        setMode(prev => reduceRightPaneMode(prev, action));
    }, []);

    // Persist only when the docked/closed distinction changes (overlay is ephemeral, so it never
    // writes the option). Kept out of the updater to avoid duplicate writes from re-invoked updaters.
    const prevModeRef = useRef<RightPaneMode>(mode);
    useEffect(() => {
        const prev = prevModeRef.current;
        if (prev !== mode) {
            const persist = persistedRightPaneVisible(prev, mode);
            if (persist !== null) {
                options.save("rightPaneVisible", persist.toString());
            }
            prevModeRef.current = mode;
        }
    }, [ mode ]);

    const toggleOverlay = useCallback(() => apply("toggleOverlay"), [ apply ]);
    const dock = useCallback(() => apply("dock"), [ apply ]);
    const close = useCallback(() => apply("close"), [ apply ]);

    // Legacy entry points (tab-row toggle, empty-state button) open/close the *docked* pane.
    useTriliumEvent("toggleRightPane", useCallback(() => apply("toggleDocked"), [ apply ]));
    // Keyboard shortcut: peek the pane as an overlay (same as clicking the handle).
    useTriliumEvent("peekRightPane", useCallback(() => apply("toggleOverlay"), [ apply ]));

    useOverlayDismiss(mode === "overlay", close);

    return (
        <>
            {/* Absolutely positioned in a reserved gutter on the viewport's right edge, so it
                stays put regardless of the panel's open/collapsed state (see RightPanelContainer.css). */}
            <RightPaneToggleHandle rightPaneVisible={visible} onToggle={toggleOverlay} />
            {/* Persistent host so #right-pane never reparents between modes (which would remount the
                sidebar widgets). Docked: an in-flow flex child Split resizes against #center-pane.
                Overlay: an absolute layer over the content where Split resizes the spacer vs the pane. */}
            <div id="right-pane-host" class={mode === "overlay" ? "overlay" : undefined}>
                {/* The spacer is both the left Split target and the dismiss backdrop in overlay mode:
                    it covers the content (a click dismisses) and shields the PDF iframe so Split's
                    drag tracking isn't interrupted. Always rendered + CSS-toggled to keep the host's
                    child list structurally stable for Split's gutter injection. */}
                <div class="right-pane-overlay-spacer" />
                {/* Mode class (right-pane-mode-docked / -overlay) as a styling hook; none when closed. */}
                <div id="right-pane" class={visible ? `right-pane-mode-${mode}` : undefined}>
                    {visible && (
                        <div class="right-pane-actions">
                            {/* Pin only applies while overlaying (it docks the pane); close shows in both modes. */}
                            {mode === "overlay" && <ActionButton icon="bx bx-pin" text={t("right_pane.dock")} onClick={dock} />}
                            <ActionButton icon="bx bx-x" text={t("right_pane.close")} onClick={close} />
                        </div>
                    )}
                    {visible && (
                        items.length > 0 ? (
                            items
                        ) : (
                            <NoItems
                                icon="bx bx-sidebar"
                                text={t("right_pane.empty_message")}
                            >
                                {/* The overlay auto-closes (outside click / focus loss / Esc), so a manual hide button is redundant there. */}
                                {mode !== "overlay" && (
                                    <Button
                                        text={t("right_pane.empty_button")}
                                        triggerCommand="toggleRightPane"
                                    />
                                )}
                            </NoItems>
                        )
                    )}
                </div>
            </div>
        </>
    );
}

function useItems(rightPaneVisible: boolean, widgetsByParent: WidgetsByParent) {
    const { note } = useActiveNoteContext();
    const noteType = useNoteProperty(note, "type");
    const noteMime = useNoteProperty(note, "mime");
    const [ highlightsList ] = useTriliumOptionJson<string[]>("highlightsList");
    // Subscribe to the AI toggle so the LLM sidebar is added/removed reactively without a page reload.
    const [ aiEnabled ] = useTriliumOptionBool("aiEnabled");
    const isPdf = noteType === "file" && noteMime === "application/pdf";

    if (!rightPaneVisible) return [];
    const definitions: RightPanelWidgetDefinition[] = [
        {
            el: <TableOfContents />,
            enabled: (noteType === "text" || noteType === "doc" || isPdf || !!note?.isMarkdown()),
        },
        {
            el: <PdfPages />,
            enabled: isPdf,
        },
        {
            el: <PdfAttachments />,
            enabled: isPdf,
        },
        {
            el: <PdfLayers />,
            enabled: isPdf,
        },
        {
            el: <PdfAnnotations />,
            enabled: isPdf,
        },
        {
            el: <HighlightsList />,
            enabled: noteType === "text" && highlightsList.length > 0,
        },
        {
            // Loaded lazily because the chat pulls in the whole LLM + CKEditor graph,
            // which users without the LLM experimental feature should never download.
            el: <LazyComponent loader={() => import("./SidebarChat.jsx")} />,
            enabled: noteType !== "llmChat" && !isStandalone && aiEnabled,
            position: 1000
        },
        ...widgetsByParent.getLegacyWidgets("right-pane").map((widget) => ({
            el: <CustomLegacyWidget key={widget._noteId} originalWidget={widget as LegacyRightPanelWidget} />,
            enabled: true,
            position: widget.position
        })),
        ...widgetsByParent.getPreactWidgets("right-pane").map((widget) => {
            const El = widget.render;
            return {
                el: <El />,
                enabled: true,
                position: widget.position
            };
        })
    ];

    // Assign a position to items that don't have one yet.
    let pos = 10;
    for (const definition of definitions) {
        if (!definition.position) {
            definition.position = pos;
            pos += 10;
        }
    }

    return definitions
        .filter(e => e.enabled)
        .toSorted((a, b) => (a.position ?? 10) - (b.position ?? 10))
        .map(e => e.el);
}

function useSplit(mode: RightPaneMode) {
    useEffect(() => {
        if (mode === "closed") return;

        // We are intentionally omitting useTriliumOption to avoid re-render due to size change.
        const rightPaneWidth = Math.min(MAX_WIDTH_PERCENT, Math.max(MIN_WIDTH_PERCENT, options.getInt("rightPaneWidth") ?? MIN_WIDTH_PERCENT));

        // Cap the right pane at MAX_WIDTH_PERCENT. Enforced in onDrag using Split's live percentages
        // rather than its px-based maxSize, so the cap stays correct across window resizes.
        let splitInstance: ReturnType<typeof Split> | undefined;
        const onDrag = (sizes: number[]) => {
            if (sizes[1] > MAX_WIDTH_PERCENT) {
                splitInstance?.setSizes([100 - MAX_WIDTH_PERCENT, MAX_WIDTH_PERCENT]);
            }
        };
        const onDragEnd = (sizes: number[]) => options.save("rightPaneWidth", Math.round(sizes[1]));

        // Docked: resize the host (and thus the content) against #center-pane.
        // Overlay: resize the pane against the spacer inside the absolute host — the content (#center-pane)
        // is untouched, so it never reflows.
        splitInstance = mode === "docked"
            ? Split(["#center-pane", "#right-pane-host"], {
                sizes: [100 - rightPaneWidth, rightPaneWidth],
                gutterSize: DEFAULT_GUTTER_SIZE,
                minSize: [300, 180],
                rtl: glob.isRtl,
                onDrag,
                onDragEnd
            })
            : Split([".right-pane-overlay-spacer", "#right-pane"], {
                sizes: [100 - rightPaneWidth, rightPaneWidth],
                gutterSize: DEFAULT_GUTTER_SIZE,
                minSize: [0, 180],
                rtl: glob.isRtl,
                onDrag,
                onDragEnd
            });
        return () => splitInstance?.destroy();
    }, [ mode ]);
}

type RightPaneAction = "toggleOverlay" | "toggleDocked" | "dock" | "close";

/** The next mode for a given action (pure). `toggle*` open from closed and close otherwise. */
export function reduceRightPaneMode(prev: RightPaneMode, action: RightPaneAction): RightPaneMode {
    switch (action) {
        case "toggleOverlay": return prev === "closed" ? "overlay" : "closed";
        case "toggleDocked": return prev === "closed" ? "docked" : "closed";
        case "dock": return "docked";
        case "close": return "closed";
    }
}

/**
 * The value to write to the persisted `rightPaneVisible` option for a transition, or null when it
 * shouldn't change — only the docked/closed distinction is persisted; overlay is runtime-only.
 */
export function persistedRightPaneVisible(prev: RightPaneMode, next: RightPaneMode): boolean | null {
    return (prev === "docked") !== (next === "docked") ? next === "docked" : null;
}

// Clicks within these keep the overlay open: the pane, the toggle handle, the resize gutter, and
// popups that sidebar content renders into portals on document.body, outside #right-pane — dropdowns,
// tooltips, modals, CKEditor balloons (chat input) and Flatpickr calendars (date attributes). The
// spacer/backdrop is intentionally NOT listed, so clicking the covered content area dismisses.
const OVERLAY_KEEP_OPEN_SELECTOR = "#right-pane, .right-pane-toggle-handle, .gutter, .dropdown-menu, .tooltip, .modal, .popover, .ck-balloon-panel, .ck-body, .flatpickr-calendar";

/** Whether an event target lies within the overlay or an allowlisted popup (i.e. should keep it open). */
export function isWithinOverlay(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest(OVERLAY_KEEP_OPEN_SELECTOR) !== null;
}

/**
 * While `active`, closes the overlay on an outside press or Escape. Presses over the content area
 * (including the PDF iframe) land on the backdrop element and so reach this listener; presses on
 * chrome the backdrop doesn't cover (tree, toolbar, tabs) are caught directly. Capture phase so a
 * child's `stopPropagation` can't keep a stale overlay open.
 */
export function useOverlayDismiss(active: boolean, onDismiss: () => void) {
    useEffect(() => {
        if (!active) return;
        const onPointerDown = (e: PointerEvent) => {
            if (!isWithinOverlay(e.target)) onDismiss();
        };
        const onKeyDown = (e: KeyboardEvent) => {
            // Skip if an inner element already handled Escape (e.g. closed a dropdown or cleared an input).
            if (e.key === "Escape" && !e.defaultPrevented) {
                onDismiss();
                document.querySelector<HTMLElement>(".right-pane-toggle-handle")?.focus();
            }
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [ active, onDismiss ]);
}

function CustomLegacyWidget({ originalWidget }: { originalWidget: LegacyRightPanelWidget }) {
    const containerRef = useRef<HTMLDivElement>(null);

    return (
        <RightPanelWidget
            id={originalWidget._noteId}
            title={originalWidget.widgetTitle}
            containerRef={containerRef}
            contextMenuItems={[
                {
                    title: t("right_pane.custom_widget_go_to_source"),
                    uiIcon: "bx bx-code-curly",
                    handler: () => appContext.tabManager.openInNewTab(originalWidget._noteId, null, true)
                }
            ]}
        >
            <CustomWidgetContent originalWidget={originalWidget} />
        </RightPanelWidget>
    );
}

function CustomWidgetContent({ originalWidget }: { originalWidget: LegacyRightPanelWidget }) {
    const { noteContext } = useActiveNoteContext();
    const [ el ] = useLegacyWidget(() => {
        originalWidget.contentSized();

        // Monkey-patch the original widget by replacing the default initialization logic.
        originalWidget.doRender = function doRender(this: LegacyRightPanelWidget) {
            this.$widget = $("<div>");
            this.$body = this.$widget;
            const renderResult = this.doRenderBody();
            if (typeof renderResult === "object" && "catch" in renderResult) {
                this.initialized = renderResult.catch((e) => {
                    this.logRenderingError(e);
                });
            } else {
                this.initialized = Promise.resolve();
            }
        };

        return originalWidget;
    }, {
        noteContext
    });

    return el;
}
