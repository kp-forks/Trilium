import "./shortcut_hint_button.css";

import clsx from "clsx";
import { useCallback, useContext, useEffect, useRef, useState } from "preact/hooks";

import appContext from "../../components/app_context.js";
import { t } from "../../services/i18n.js";
import keyboard_actions from "../../services/keyboard_actions.js";
import { formatShortcut, joinShortcut } from "../../services/keyboard_shortcut_display.js";
import { collectShortcutHints } from "../../services/shortcut_hints.js";
import { useStaticTooltip } from "../react/hooks.js";
import { ParentComponent } from "../react/react_utils.js";

/**
 * Overlay button that opens the contextual shortcut-hints pane as a dropdown, collecting the hints
 * from its own widget context. Reusable across widgets (image viewer, media player, …); the caller
 * positions it via `className` on the overlay group.
 */
export default function ShortcutHintButton({ className }: { className?: string }) {
    const parentComponent = useContext(ParentComponent);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [ shortcut, setShortcut ] = useState("Alt+F1");

    useEffect(() => {
        keyboard_actions.getAction("showShortcutHints", true).then(action => {
            const first = action?.effectiveShortcuts?.[0];
            if (first) setShortcut(joinShortcut(formatShortcut(first), "+"));
        });
    }, []);

    useStaticTooltip(buttonRef, { title: t("shortcut_hints.show_button"), placement: "bottom" });

    const onClick = useCallback(() => {
        const sections = collectShortcutHints(parentComponent);
        appContext.triggerEvent("shortcutHintsRequested", { sections, anchor: buttonRef.current });
    }, [ parentComponent ]);

    return (
        <div className={clsx("tn-overlay-control-group", "shortcut-hint-button-group", className)}>
            <button
                ref={buttonRef}
                type="button"
                className="tn-overlay-text-button shortcut-hint-button"
                aria-label={t("shortcut_hints.show_button")}
                onClick={onClick}
            >
                <span className="shortcut-hint-button-key">{shortcut}</span>
                <kbd>?</kbd>
            </button>
        </div>
    );
}
