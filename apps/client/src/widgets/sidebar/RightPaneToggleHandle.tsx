import "./RightPaneToggleHandle.css";

import { Tooltip } from "bootstrap";
import clsx from "clsx";
import { useCallback, useMemo, useRef } from "preact/hooks";

import { t } from "../../services/i18n";
import { useStaticTooltip } from "../react/hooks";

// Gap (px) between the handle and its tooltip, so the tooltip can't overlap the handle.
const TOOLTIP_MARGIN_PX = 8;

interface RightPaneToggleHandleProps {
    /** Owned and persisted by RightPanelContainer; this component only reflects it. */
    rightPaneVisible: boolean;
    /** Toggles the pane (opens it as an overlay, or closes it); owned by RightPanelContainer. */
    onToggle: () => void;
}

export default function RightPaneToggleHandle({ rightPaneVisible, onToggle }: RightPaneToggleHandleProps) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    // Pointer's vertical position captured once on hover; null until the mouse enters
    // (e.g. on keyboard focus) so the tooltip falls back to the handle's centre.
    const pointerY = useRef<number | null>(null);

    const handleClick = useCallback(() => {
        onToggle();
        // Reset Bootstrap's hover/focus trigger state. A click otherwise leaves the button
        // focused, which keeps the tooltip "stuck" and prevents it re-triggering on next hover.
        const button = buttonRef.current;
        if (button) {
            Tooltip.getInstance(button)?.hide();
            button.blur();
        }
    }, [ onToggle ]);

    // Anchor the tooltip to the pointer's entry height rather than the centre of the
    // full-height handle, by shifting it along the cross axis. Not tracked: `pointerY`
    // is only updated on mouse enter, and the offset is recomputed from it on show.
    // The `distance` (second value) keeps the tooltip clear of the handle so it can't
    // overlap it and cause hover flicker.
    const tooltipConfig = useMemo(() => ({
        // Open: a click hides it. Closed: a click peeks it (the transient overlay; the pin docks it).
        title: rightPaneVisible ? t("right_pane.hide") : t("right_pane.peek"),
        placement: "left" as const,
        offset: () => {
            const rect = buttonRef.current?.getBoundingClientRect();
            if (!rect || pointerY.current === null) return [ 0, TOOLTIP_MARGIN_PX ] as [number, number];
            return [ pointerY.current - (rect.top + rect.height / 2), TOOLTIP_MARGIN_PX ] as [number, number];
        }
    }), [ rightPaneVisible ]);
    useStaticTooltip(buttonRef, tooltipConfig);

    return (
        <button
            ref={buttonRef}
            type="button"
            aria-label={t("right_pane.toggle")}
            class={clsx(
                "right-pane-toggle-handle bx",
                rightPaneVisible ? "bx-chevron-right" : "bx-chevron-left",
                rightPaneVisible ? "right-pane-toggle-handle-action-collapse" : "right-pane-toggle-handle-action-expand"
            )}
            onMouseEnter={(e) => { pointerY.current = e.clientY; }}
            onMouseLeave={() => { pointerY.current = null; }}
            onClick={handleClick}
        />
    );
}
