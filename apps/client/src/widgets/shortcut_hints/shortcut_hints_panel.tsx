import "./shortcut_hints_panel.css";

import { Fragment } from "preact";
import { createPortal } from "preact/compat";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { t } from "../../services/i18n.js";
import keyboard_actions from "../../services/keyboard_actions.js";
import type { ShortcutHint, ShortcutHintSection } from "../../services/shortcut_hints.js";
import { useTriliumEvent } from "../react/hooks.js";
import { joinElements } from "../react/react_utils.js";
import { renderShortcutKbds } from "../react/shortcut_kbd.js";

/** How long the panel stays up when left untouched. Paused while hovered; other signals dismiss it sooner. */
const AUTO_DISMISS_MS = 5000;

export default function ShortcutHintsPanel() {
    // `undefined` means closed. Only ever set to a non-empty array, so presence == open.
    const [ sections, setSections ] = useState<ShortcutHintSection[]>();
    const panelRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<number>();

    const close = useCallback(() => setSections(undefined), []);
    const clearTimer = useCallback(() => {
        if (timerRef.current !== undefined) {
            window.clearTimeout(timerRef.current);
            timerRef.current = undefined;
        }
    }, []);
    const startTimer = useCallback(() => {
        clearTimer();
        timerRef.current = window.setTimeout(close, AUTO_DISMISS_MS);
    }, [ clearTimer, close ]);

    // Alt+F1 toggles: close if open, otherwise open (unless there's nothing to show).
    useTriliumEvent("shortcutHintsRequested", useCallback(({ sections: incoming }) => {
        setSections(prev => (prev !== undefined || incoming.length === 0) ? undefined : incoming);
    }, []));
    useTriliumEvent("activeContextChanged", close);

    const isOpen = sections !== undefined;
    useEffect(() => {
        if (!isOpen) {
            clearTimer();
            return;
        }
        startTimer();

        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") close();
        }
        function onMouseDown(e: MouseEvent) {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) close();
        }
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("mousedown", onMouseDown);
        return () => {
            clearTimer();
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("mousedown", onMouseDown);
        };
    }, [ isOpen, startTimer, clearTimer, close ]);

    if (!sections) {
        return null;
    }

    // Portal to <body> so no transformed / contained / overflow-clipped ancestor breaks the fixed
    // positioning or hides it behind content.
    return createPortal(
        <div ref={panelRef} className="shortcut-hints-panel" onMouseEnter={clearTimer} onMouseLeave={startTimer}>
            <ShortcutHintsSections sections={sections} />
        </div>,
        document.body
    );
}

export function ShortcutHintsSections({ sections }: { sections: ShortcutHintSection[] }) {
    return (
        <>
            {sections.map((section, i) => (
                <div className="shortcut-hints-section" key={i}>
                    {section.titleKey && <div className="shortcut-hints-section-title">{t(section.titleKey)}</div>}
                    <ul>
                        {section.hints.map((hint, j) => <HintRow hint={hint} key={j} />)}
                    </ul>
                </div>
            ))}
        </>
    );
}

function HintRow({ hint }: { hint: ShortcutHint }) {
    const [ shortcuts, setShortcuts ] = useState<string[]>(() => "keys" in hint ? hint.keys : []);
    const [ friendlyName, setFriendlyName ] = useState<string>();

    useEffect(() => {
        if ("keys" in hint) {
            setShortcuts(hint.keys);
            return;
        }
        // `action` hints resolve to the user's current, rebindable binding.
        keyboard_actions.getAction(hint.action).then(action => {
            setShortcuts(action?.effectiveShortcuts ?? []);
            setFriendlyName(action?.friendlyName);
        });
    }, [ hint ]);

    const description = hint.labelKey ? t(hint.labelKey) : friendlyName ?? "";

    return (
        <li className="shortcut-hint">
            <span className="shortcut-hint-keys">
                {joinElements(shortcuts.map((shortcut, i) => <Fragment key={i}>{renderShortcutKbds(shortcut)}</Fragment>), ", ")}
            </span>
            <span className="shortcut-hint-description">{description}</span>
        </li>
    );
}
