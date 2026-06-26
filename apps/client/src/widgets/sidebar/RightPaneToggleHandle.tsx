import "./RightPaneToggleHandle.css";

import { Tooltip } from "bootstrap";
import clsx from "clsx";
import { useCallback, useMemo, useRef, useState } from "preact/hooks";

import appContext from "../../components/app_context";
import { t } from "../../services/i18n";
import options from "../../services/options";
import { useStaticTooltip, useTriliumEvent } from "../react/hooks";

export default function RightPaneToggleHandle() {
    const buttonRef = useRef<HTMLButtonElement>(null);
    // Pointer's vertical position captured once on hover; null until the mouse enters
    // (e.g. on keyboard focus) so the tooltip falls back to the handle's centre.
    const pointerY = useRef<number | null>(null);
    const [ rightPaneVisible, setRightPaneVisible ] = useState(options.is("rightPaneVisible"));

    // Mirror the state so the arrow direction stays in sync; RightPanelContainer owns persistence.
    useTriliumEvent("toggleRightPane", useCallback(() => {
        setRightPaneVisible(current => !current);
    }, []));

    const handleClick = useCallback(() => {
        appContext.triggerCommand("toggleRightPane");
        // Reset Bootstrap's hover/focus trigger state. A click otherwise leaves the button
        // focused, which keeps the tooltip "stuck" and prevents it re-triggering on next hover.
        const button = buttonRef.current;
        if (button) {
            Tooltip.getInstance(button)?.hide();
            button.blur();
        }
    }, []);

    // Anchor the tooltip to the pointer's entry height rather than the centre of the
    // full-height handle, by shifting it along the cross axis. Not tracked: `pointerY`
    // is only updated on mouse enter, and the offset is recomputed from it on show.
    const tooltipConfig = useMemo(() => ({
        title: t("right_pane.toggle"),
        placement: "left" as const,
        offset: () => {
            const rect = buttonRef.current?.getBoundingClientRect();
            if (!rect || pointerY.current === null) return [ 0, 0 ] as [number, number];
            return [ pointerY.current - (rect.top + rect.height / 2), 0 ] as [number, number];
        }
    }), []);
    useStaticTooltip(buttonRef, tooltipConfig);

    return (
        <button
            ref={buttonRef}
            class={clsx(
                "right-pane-toggle-handle bx",
                rightPaneVisible ? "bx-chevron-right" : "bx-chevron-left",
                rightPaneVisible ? "right-pane-toggle-handle-action-collapse" : "right-pane-toggle-handle-action-expand"
            )}
            onMouseEnter={(e) => { pointerY.current = e.clientY; }}
            onClick={handleClick}
        />
    );
}
