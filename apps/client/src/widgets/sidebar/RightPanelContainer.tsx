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
    useSplit(mode === "docked");

    // Apply a transition, persisting only when the docked/closed distinction changes
    // (overlay is ephemeral, so it never writes the option).
    const apply = useCallback((action: RightPaneAction) => {
        setMode(prev => {
            const next = reduceRightPaneMode(prev, action);
            const persist = persistedRightPaneVisible(prev, next);
            if (persist !== null) {
                options.save("rightPaneVisible", persist.toString());
            }
            return next;
        });
    }, []);

    const toggleOverlay = useCallback(() => apply("toggleOverlay"), [ apply ]);
    const dock = useCallback(() => apply("dock"), [ apply ]);
    const close = useCallback(() => apply("close"), [ apply ]);

    // Legacy entry points (tab-row toggle, empty-state button) open/close the *docked* pane.
    useTriliumEvent("toggleRightPane", useCallback(() => apply("toggleDocked"), [ apply ]));

    useOverlayDismiss(mode === "overlay", close);

    // The overlay reuses the docked width but can't be sized by Split (the content pane isn't flexed),
    // so it's applied as an inline width here — a genuinely computed value that can't live in CSS.
    const overlayStyle = mode === "overlay"
        ? { width: `${Math.max(MIN_WIDTH_PERCENT, options.getInt("rightPaneWidth") ?? MIN_WIDTH_PERCENT)}%` }
        : undefined;

    return (
        <>
            {/* Absolutely positioned in a reserved gutter on the viewport's right edge, so it
                stays put regardless of the panel's open/collapsed state (see RightPanelContainer.css). */}
            <RightPaneToggleHandle rightPaneVisible={visible} onToggle={toggleOverlay} />
            {/* Visual dismiss cue and a physical layer over the content area (so presses over the
                PDF iframe reach the document listener in useOverlayDismiss). Always rendered, toggled
                via CSS, so the fragment's child list stays structurally stable: Split.js injects a
                gutter among these siblings, and mounting/unmounting a Preact-managed sibling around
                it corrupts reconciliation (insertBefore error). */}
            <div class={mode === "overlay" ? "right-pane-overlay-backdrop active" : "right-pane-overlay-backdrop"} />
            <div id="right-pane" class={mode === "overlay" ? "overlay" : undefined} style={overlayStyle}>
                {mode === "overlay" && (
                    <div class="right-pane-overlay-actions">
                        <ActionButton icon="bx bx-pin" text={t("right_pane.dock")} onClick={dock} />
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
                            <Button
                                text={t("right_pane.empty_button")}
                                triggerCommand="toggleRightPane"
                            />
                        </NoItems>
                    )
                )}
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

function useSplit(visible: boolean) {
    // Split between right pane and the content pane.
    useEffect(() => {
        if (!visible) return;

        // We are intentionally omitting useTriliumOption to avoid re-render due to size change.
        const rightPaneWidth = Math.max(MIN_WIDTH_PERCENT, options.getInt("rightPaneWidth") ?? MIN_WIDTH_PERCENT);
        const splitInstance = Split(["#center-pane", "#right-pane"], {
            sizes: [100 - rightPaneWidth, rightPaneWidth],
            gutterSize: DEFAULT_GUTTER_SIZE,
            minSize: [300, 180],
            rtl: glob.isRtl,
            onDragEnd: (sizes) => options.save("rightPaneWidth", Math.round(sizes[1]))
        });
        return () => splitInstance.destroy();
    }, [ visible ]);
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

// Clicks within these keep the overlay open: the pane, the toggle handle, and popups that sidebar
// content renders into portals outside #right-pane (dropdowns, tooltips, modals). The backdrop is
// intentionally NOT listed, so clicking the (covered) content area dismisses like other outside clicks.
const OVERLAY_KEEP_OPEN_SELECTOR = "#right-pane, .right-pane-toggle-handle, .dropdown-menu, .tooltip, .modal, .popover";

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
            if (e.key === "Escape") {
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
