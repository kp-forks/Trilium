import "./shortcuts.css";

import { ActionKeyboardShortcut, KeyboardShortcut, OptionNames } from "@triliumnext/commons";
import { Dropdown as BootstrapDropdown } from "bootstrap";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";

import dialog from "../../../services/dialog";
import { t } from "../../../services/i18n";
import options from "../../../services/options";
import server from "../../../services/server";
import { canonicalizeShortcut, KEYCODES_WITH_NO_MODIFIER } from "../../../services/shortcuts";
import toast from "../../../services/toast";
import { arrayEqual, isElectron, reloadFrontendApp } from "../../../services/utils";
import ActionButton from "../../react/ActionButton";
import Button from "../../react/Button";
import Dropdown from "../../react/Dropdown";
import { FormDropdownDivider, FormListItem } from "../../react/FormList";
import FormText from "../../react/FormText";
import FormTextBox from "../../react/FormTextBox";
import { useTriliumEvent } from "../../react/hooks";
import NoItems from "../../react/NoItems";
import RawHtml from "../../react/RawHtml";
import OptionsRow from "./components/OptionsRow";
import OptionsSection from "./components/OptionsSection";

export default function ShortcutSettings() {
    const [ keyboardShortcuts, setKeyboardShortcuts ] = useState<KeyboardShortcut[]>([]);
    const [ filter, setFilter ] = useState<string>();
    const [ activeFilter, setActiveFilter ] = useState<ShortcutFilter>(null);
    const filterDropdownRef = useRef<BootstrapDropdown>(null);

    const selectFilter = useCallback((value: ShortcutFilter) => {
        setActiveFilter(value);
        filterDropdownRef.current?.hide();
    }, []);

    useEffect(() => {
        server.get<KeyboardShortcut[]>("keyboard-actions").then(setKeyboardShortcuts);
    }, []);

    useTriliumEvent("entitiesReloaded", ({ loadResults }) => {
        const optionNames = loadResults.getOptionNames();
        if (!optionNames || !optionNames.length) {
            return;
        }

        let updatedShortcuts: (KeyboardShortcut[] | null) = null;

        for (const optionName of optionNames) {
            if (!(optionName.startsWith("keyboardShortcuts"))) {
                continue;
            }

            const newValue = options.get(optionName);
            const actionName = getActionNameFromOptionName(optionName);
            const correspondingShortcut = keyboardShortcuts.find(s => "actionName" in s && s.actionName === actionName);
            if (correspondingShortcut && "effectiveShortcuts" in correspondingShortcut) {
                correspondingShortcut.effectiveShortcuts = JSON.parse(newValue);

                if (!updatedShortcuts) {
                    updatedShortcuts = Array.from(keyboardShortcuts);
                }
            }
        }

        if (updatedShortcuts) {
            setKeyboardShortcuts(updatedShortcuts);
        }
    });

    const resetShortcuts = useCallback(async () => {
        if (!(await dialog.confirm(t("shortcuts.confirm_reset")))) {
            return;
        }

        const optionsToSet: Record<string, string> = {};
        for (const keyboardShortcut of keyboardShortcuts) {
            if (!("effectiveShortcuts" in keyboardShortcut) || !keyboardShortcut.effectiveShortcuts) {
                continue;
            }

            const defaultShortcuts = keyboardShortcut.defaultShortcuts ?? [];
            if (!arrayEqual(keyboardShortcut.effectiveShortcuts, defaultShortcuts)) {
                optionsToSet[getOptionName(keyboardShortcut.actionName)] = JSON.stringify(defaultShortcuts);
            }
        }
        options.saveMany(optionsToSet);
    }, [ keyboardShortcuts ]);

    const filterLowerCase = filter?.toLowerCase() ?? "";
    const groups = useMemo(() => groupShortcuts(keyboardShortcuts), [ keyboardShortcuts ]);
    const conflicts = useMemo(() => computeConflicts(keyboardShortcuts), [ keyboardShortcuts ]);
    const globalCount = useMemo(() => keyboardShortcuts.filter((s) => "actionName" in s && hasGlobalShortcut(s)).length, [ keyboardShortcuts ]);
    const filteredGroups = groups
        .map((group) => ({
            ...group,
            actions: group.actions.filter((action) =>
                matchesFilter(action, activeFilter, conflicts) &&
                (!filter || filterKeyboardAction(action, filterLowerCase)))
        }))
        .filter((group) => group.actions.length > 0);

    return (
        <div className="shortcuts-options-section">
            <FormText>
                {t("shortcuts.multiple_shortcuts")}{" "}
                <RawHtml html={t("shortcuts.electron_documentation")} />
            </FormText>

            <header>
                <FormTextBox
                    placeholder={t("shortcuts.type_text_to_filter")}
                    currentValue={filter} onChange={(value) => setFilter(value)}
                />
                <Dropdown
                    buttonClassName={`bx bx-filter-alt ${activeFilter ? "active" : ""}`}
                    hideToggleArrow
                    noSelectButtonStyle
                    noDropdownListStyle
                    iconAction
                    title={t("shortcuts.filter")}
                    dropdownRef={filterDropdownRef}
                >
                    <FilterContent
                        activeFilter={activeFilter}
                        onSelect={selectFilter}
                        conflictCount={conflicts.size}
                        globalCount={globalCount}
                    />
                </Dropdown>
            </header>

            {filteredGroups.length > 0
                ? filteredGroups.map((group) => (
                    <OptionsSection key={group.title} title={group.title}>
                        {group.actions.map((action) => (
                            <ShortcutRow key={action.actionName} action={action} conflicts={conflicts.get(action.actionName)} />
                        ))}
                    </OptionsSection>
                ))
                : filter
                    ? (
                        <NoItems
                            icon="bx bx-filter-alt"
                            text={t("shortcuts.no_results", { filter })}
                        />
                    )
                    : activeFilter === "conflicts" && conflicts.size === 0
                        ? (
                            <NoItems
                                icon="bx bx-check-circle"
                                text={t("shortcuts.no_conflicts")}
                            />
                        )
                        : (
                            <NoItems
                                icon="bx bx-filter-alt"
                                text={t("shortcuts.no_matches")}
                            />
                        )}

            <footer>
                <Button
                    text={t("shortcuts.reload_app")}
                    onClick={reloadFrontendApp}
                />

                <Button
                    text={t("shortcuts.set_all_to_default")}
                    onClick={resetShortcuts}
                />
            </footer>
        </div>
    );
}

interface ShortcutGroup {
    title: string;
    actions: ActionKeyboardShortcut[];
}

function groupShortcuts(shortcuts: KeyboardShortcut[]): ShortcutGroup[] {
    const groups: ShortcutGroup[] = [];

    for (const shortcut of shortcuts) {
        if ("separator" in shortcut) {
            groups.push({ title: shortcut.separator, actions: [] });
        } else {
            groups[groups.length - 1]?.actions.push(shortcut);
        }
    }

    return groups;
}

/**
 * Maps a single shortcut string (as stored, e.g. `Ctrl+J` or `global:Ctrl+J`) to the friendly names
 * of the *other* actions that fire on the same physical combination.
 */
type ShortcutConflicts = Map<string, string[]>;

/**
 * Detects shortcut conflicts in a single O(total shortcuts) pass and returns a render-ready lookup:
 * `actionName → (shortcut string → conflicting action names)`. A row not present in the map has no
 * conflicts, and a shortcut not present on a row's entry is conflict-free — so the render path is
 * just two cheap map lookups, with all the canonicalization done up front.
 *
 * Two shortcuts conflict when their {@link canonicalizeShortcut} forms match. The `global:` prefix is
 * stripped first: an OS-level global shortcut still swallows the same combination an in-app one wants.
 */
export function computeConflicts(shortcuts: KeyboardShortcut[]): Map<string, ShortcutConflicts> {
    // First pass: bucket every action by the canonical combination of each of its shortcuts.
    const byCombo = new Map<string, ActionKeyboardShortcut[]>();
    for (const shortcut of shortcuts) {
        if (!("actionName" in shortcut)) {
            continue;
        }

        for (const combo of shortcut.effectiveShortcuts ?? []) {
            const key = canonicalizeShortcut(stripGlobalPrefix(combo));
            if (!key) {
                continue;
            }

            let actions = byCombo.get(key);
            if (!actions) {
                byCombo.set(key, actions = []);
            }
            if (!actions.includes(shortcut)) {
                actions.push(shortcut);
            }
        }
    }

    // Second pass: for combinations shared by 2+ actions, record the conflicting names per action.
    const result = new Map<string, ShortcutConflicts>();
    for (const shortcut of shortcuts) {
        if (!("actionName" in shortcut)) {
            continue;
        }

        for (const combo of shortcut.effectiveShortcuts ?? []) {
            const actions = byCombo.get(canonicalizeShortcut(stripGlobalPrefix(combo)));
            if (!actions || actions.length < 2) {
                continue;
            }

            const others = actions
                .filter((other) => other !== shortcut)
                .map((other) => other.friendlyName ?? other.actionName);
            if (!others.length) {
                continue;
            }

            let perShortcut = result.get(shortcut.actionName);
            if (!perShortcut) {
                result.set(shortcut.actionName, perShortcut = new Map());
            }
            perShortcut.set(combo, [ ...new Set(others) ]);
        }
    }

    return result;
}

/**
 * The active list filter: `"conflicts"` keeps only actions involved in a conflict, `"global"` keeps
 * only actions that have a system-wide (global) shortcut, and `null` applies no restriction.
 */
type ShortcutFilter = "conflicts" | "global" | null;

function hasGlobalShortcut(action: ActionKeyboardShortcut) {
    return (action.effectiveShortcuts ?? []).some(isGlobalShortcut);
}

export function matchesFilter(action: ActionKeyboardShortcut, activeFilter: ShortcutFilter, conflicts: Map<string, ShortcutConflicts>) {
    switch (activeFilter) {
        case "conflicts":
            return conflicts.has(action.actionName);
        case "global":
            return hasGlobalShortcut(action);
        default:
            return true;
    }
}

function FilterContent({ activeFilter, onSelect, conflictCount, globalCount }: {
    activeFilter: ShortcutFilter;
    onSelect: (value: ShortcutFilter) => void;
    conflictCount: number;
    globalCount: number;
}) {
    return (
        <>
            <FormListItem
                checked={activeFilter === null}
                onClick={() => onSelect(null)}
            >{t("shortcuts.filter_all")}</FormListItem>
            <FormDropdownDivider />
            <FormListItem
                checked={activeFilter === "conflicts"}
                onClick={() => onSelect("conflicts")}
            >{conflictCount > 0 ? t("shortcuts.filter_conflicts_count", { count: conflictCount }) : t("shortcuts.filter_conflicts")}</FormListItem>
            <FormListItem
                checked={activeFilter === "global"}
                onClick={() => onSelect("global")}
            >{globalCount > 0 ? t("shortcuts.filter_global_count", { count: globalCount }) : t("shortcuts.filter_global")}</FormListItem>
        </>
    );
}

function isShortcutModified(action: ActionKeyboardShortcut) {
    return !arrayEqual(action.effectiveShortcuts ?? [], action.defaultShortcuts ?? []);
}

function revertShortcut(action: ActionKeyboardShortcut) {
    void options.save(getOptionName(action.actionName), JSON.stringify(action.defaultShortcuts ?? []));
}

function formatDefaultShortcuts(action: ActionKeyboardShortcut) {
    return action.defaultShortcuts?.length
        ? action.defaultShortcuts.join(", ")
        : t("shortcuts.no_default_shortcut");
}

function filterKeyboardAction(action: ActionKeyboardShortcut, filter: string) {
    return action.actionName.toLowerCase().includes(filter) ||
        (action.friendlyName && action.friendlyName.toLowerCase().includes(filter)) ||
        (action.defaultShortcuts ?? []).some((shortcut) => shortcut.toLowerCase().includes(filter)) ||
        (action.effectiveShortcuts ?? []).some((shortcut) => shortcut.toLowerCase().includes(filter)) ||
        (action.description && action.description.toLowerCase().includes(filter));
}

function ShortcutRow({ action, conflicts }: { action: ActionKeyboardShortcut; conflicts?: ShortcutConflicts }) {
    return (
        <OptionsRow
            name={action.actionName}
            label={
                <>
                    {isShortcutModified(action) &&
                        <span class="shortcut-modified-indicator" title={t("shortcuts.modified_from_default")} />}
                    {action.friendlyName}
                </>
            }
            description={action.description}
        >
            <div class="shortcut-row-input">
                <ShortcutEditor keyboardShortcut={action} conflicts={conflicts} />
                {/* Always reserve the slot so the revert button appearing/disappearing never shifts the row. */}
                <span class="shortcut-revert-slot">
                    {isShortcutModified(action) &&
                        <ActionButton
                            icon="bx bx-reset"
                            text={t("shortcuts.revert_to_default", { shortcuts: formatDefaultShortcuts(action) })}
                            tooltipClass="tooltip-top"
                            onClick={() => revertShortcut(action)}
                        />}
                </span>
            </div>
        </OptionsRow>
    );
}

function ShortcutEditor({ keyboardShortcut: action, conflicts }: { keyboardShortcut: ActionKeyboardShortcut; conflicts?: ShortcutConflicts }) {
    const shortcuts = action.effectiveShortcuts ?? [];
    const electron = isElectron();

    const saveShortcuts = (newShortcuts: string[]) => {
        void options.save(getOptionName(action.actionName), JSON.stringify(newShortcuts));
    };

    const addShortcut = (shortcut: string) => {
        if (!shortcuts.includes(shortcut)) {
            saveShortcuts([ ...shortcuts, shortcut ]);
        }
    };

    const toggleGlobal = (shortcut: string) => {
        const toggled = setGlobalShortcut(shortcut, !isGlobalShortcut(shortcut));
        // De-duplicate in case the toggled form already exists (e.g. both local and global variants).
        saveShortcuts([ ...new Set(shortcuts.map((s) => (s === shortcut ? toggled : s))) ]);
    };

    return (
        <div class="shortcut-editor">
            {shortcuts.map((shortcut) => {
                const global = isGlobalShortcut(shortcut);
                const conflictsWith = conflicts?.get(shortcut);
                return (
                    <span class={`shortcut-chip ${global ? "global" : ""} ${conflictsWith ? "conflict" : ""}`} key={shortcut}>
                        {conflictsWith &&
                            <span
                                class="bx bx-error-circle shortcut-chip-conflict"
                                title={t("shortcuts.conflict_chip", { actions: conflictsWith.join(", ") })}
                            />}
                        {electron
                            ? (
                                <button
                                    type="button"
                                    class={`shortcut-chip-action shortcut-chip-global ${global ? "active" : ""}`}
                                    title={global ? t("shortcuts.make_local") : t("shortcuts.make_global")}
                                    onClick={() => toggleGlobal(shortcut)}
                                >
                                    <span class="bx bx-globe" />
                                </button>
                            )
                            : global && <span class="bx bx-globe shortcut-chip-global-indicator" title={t("shortcuts.global_shortcut")} />}
                        <kbd>{stripGlobalPrefix(shortcut)}</kbd>
                        <button
                            type="button"
                            class="shortcut-chip-action shortcut-chip-remove"
                            title={t("shortcuts.remove_shortcut")}
                            onClick={() => saveShortcuts(shortcuts.filter((s) => s !== shortcut))}
                        >
                            <span class="bx bx-x" />
                        </button>
                    </span>
                );
            })}

            <ShortcutRecorder onCapture={addShortcut} />
        </div>
    );
}

const RECORDING_TOAST_ID = "shortcut-recorder-recording";

function ShortcutRecorder({ onCapture }: { onCapture: (shortcut: string) => void }) {
    const [ recording, setRecording ] = useState(false);

    useEffect(() => {
        if (!recording) {
            return;
        }

        toast.showPersistent({
            id: RECORDING_TOAST_ID,
            icon: "bx bxs-keyboard",
            message: t("shortcuts.recording_toast")
        });

        const onKeyDown = (e: KeyboardEvent) => {
            // Swallow the combination so it never reaches the application's own shortcut handlers.
            e.preventDefault();
            e.stopImmediatePropagation();

            if (e.key === "Escape") {
                setRecording(false);
                return;
            }

            // Ignore lone modifiers and invalid single-key combinations (keyboardEventToShortcut
            // returns null) so recording continues until a bindable combination is pressed.
            const shortcut = keyboardEventToShortcut(e);
            if (shortcut) {
                onCapture(shortcut);
                setRecording(false);
            }
        };

        // Capture phase on window so we intercept the keystroke ahead of any other listener.
        window.addEventListener("keydown", onKeyDown, true);
        return () => {
            window.removeEventListener("keydown", onKeyDown, true);
            toast.closePersistent(RECORDING_TOAST_ID);
        };
    }, [ recording, onCapture ]);

    // Keep the button a fixed-size icon-action in both states so toggling recording never reflows
    // the row; the recording state is conveyed through styling and the tooltip.
    return (
        <button
            type="button"
            class={`shortcut-recorder icon-action bx bx-plus ${recording ? "recording" : ""}`}
            title={recording ? t("shortcuts.press_keys") : t("shortcuts.record_shortcut")}
            onClick={() => setRecording((value) => !value)}
            onBlur={() => setRecording(false)}
        />
    );
}

const GLOBAL_PREFIX = "global:";

function isGlobalShortcut(shortcut: string) {
    return shortcut.startsWith(GLOBAL_PREFIX);
}

function stripGlobalPrefix(shortcut: string) {
    return isGlobalShortcut(shortcut) ? shortcut.substring(GLOBAL_PREFIX.length) : shortcut;
}

function setGlobalShortcut(shortcut: string, global: boolean) {
    const bare = stripGlobalPrefix(shortcut);
    return global ? `${GLOBAL_PREFIX}${bare}` : bare;
}

const MODIFIER_KEYS = new Set([ "Control", "Alt", "Shift", "Meta" ]);

const NAMED_KEYS: Record<string, string> = {
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
    " ": "Space", Spacebar: "Space"
};

/**
 * Converts a captured {@link KeyboardEvent} into a shortcut string matching the stored format
 * (e.g. `Ctrl+Shift+J`). Returns `null` when the event is not a valid, bindable shortcut, i.e.:
 *  - a lone modifier key (Ctrl/Alt/Shift/Meta), or
 *  - a modifier-less key the matcher would never fire — everything except function keys, Delete
 *    and Enter (see {@link KEYCODES_WITH_NO_MODIFIER}).
 */
export function keyboardEventToShortcut(e: KeyboardEvent): string | null {
    const key = normalizeCapturedKey(e);
    if (!key) {
        return null;
    }

    const modifiers: string[] = [];
    if (e.ctrlKey) modifiers.push("Ctrl");
    if (e.altKey) modifiers.push("Alt");
    if (e.shiftKey) modifiers.push("Shift");
    if (e.metaKey) modifiers.push("Meta");

    // Disallow single-key shortcuts that have no modifier, since they would never match at runtime.
    if (modifiers.length === 0 && !KEYCODES_WITH_NO_MODIFIER.has(e.code)) {
        return null;
    }

    return [ ...modifiers, key ].join("+");
}

function normalizeCapturedKey(e: KeyboardEvent): string | null {
    const { code, key } = e;

    if (MODIFIER_KEYS.has(key)) {
        return null;
    }

    // Use the physical code for letters/digits so the result is keyboard-layout independent.
    const letter = /^Key([A-Z])$/.exec(code);
    if (letter) {
        return letter[1];
    }
    const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
    if (digit) {
        return digit[1];
    }

    if (NAMED_KEYS[key]) {
        return NAMED_KEYS[key];
    }

    // Function keys and named keys (Enter, Delete, F5, Home, …) already match the stored format.
    return key.length === 1 ? key.toUpperCase() : key;
}

const PREFIX = "keyboardShortcuts";

function getOptionName(actionName: string) {
    return `${PREFIX}${actionName.substr(0, 1).toUpperCase()}${actionName.substr(1)}` as OptionNames;
}

function getActionNameFromOptionName(optionName: string) {
    return optionName.at(PREFIX.length)?.toLowerCase() + optionName.substring(PREFIX.length + 1);
}
