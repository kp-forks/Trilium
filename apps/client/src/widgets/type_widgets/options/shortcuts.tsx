import { ActionKeyboardShortcut, KeyboardShortcut, OptionNames } from "@triliumnext/commons";
import { t } from "../../../services/i18n";
import { arrayEqual, reloadFrontendApp } from "../../../services/utils";
import ActionButton from "../../react/ActionButton";
import Button from "../../react/Button";
import FormText from "../../react/FormText";
import FormTextBox from "../../react/FormTextBox";
import RawHtml from "../../react/RawHtml";
import OptionsRow from "./components/OptionsRow";
import OptionsSection from "./components/OptionsSection";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import server from "../../../services/server";
import options from "../../../services/options";
import dialog from "../../../services/dialog";
import { useTriliumEvent } from "../../react/hooks";
import "./shortcuts.css";
import NoItems from "../../react/NoItems";

export default function ShortcutSettings() {
    const [ keyboardShortcuts, setKeyboardShortcuts ] = useState<KeyboardShortcut[]>([]);
    const [ filter, setFilter ] = useState<string>();

    useEffect(() => {
        server.get<KeyboardShortcut[]>("keyboard-actions").then(setKeyboardShortcuts);
    }, [])

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
    const filteredGroups = groups
        .map((group) => ({
            ...group,
            actions: filter ? group.actions.filter((action) => filterKeyboardAction(action, filterLowerCase)) : group.actions
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
            </header>

            {filteredGroups.length > 0
                ? filteredGroups.map((group) => (
                    <OptionsSection key={group.title} title={group.title}>
                        {group.actions.map((action) => (
                            <ShortcutRow key={action.actionName} action={action} />
                        ))}
                    </OptionsSection>
                ))
                : (
                    <NoItems
                        icon="bx bx-filter-alt"
                        text={t("shortcuts.no_results", { filter })}
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
    )
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

function ShortcutRow({ action }: { action: ActionKeyboardShortcut }) {
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
                <ShortcutEditor keyboardShortcut={action} />
                {isShortcutModified(action) &&
                    <ActionButton
                        icon="bx bx-reset"
                        text={t("shortcuts.revert_to_default", { shortcuts: formatDefaultShortcuts(action) })}
                        onClick={() => revertShortcut(action)}
                    />}
            </div>
        </OptionsRow>
    );
}

function ShortcutEditor({ keyboardShortcut: action }: { keyboardShortcut: ActionKeyboardShortcut }) {
    const originalShortcut = (action.effectiveShortcuts ?? []).join(", ");

    return (
        <FormTextBox
            currentValue={originalShortcut}
            onBlur={(newShortcut) => {
                const { actionName } = action;
                const optionName = getOptionName(actionName);
                const newShortcuts = newShortcut
                    .replace("+,", "+Comma")
                    .split(",")
                    .map((shortcut) => shortcut.replace("+Comma", "+,"))
                    .filter((shortcut) => !!shortcut);
                options.save(optionName, JSON.stringify(newShortcuts));
            }}
        />
    )
}

const PREFIX = "keyboardShortcuts";

function getOptionName(actionName: string) {
    return `${PREFIX}${actionName.substr(0, 1).toUpperCase()}${actionName.substr(1)}` as OptionNames;
}

function getActionNameFromOptionName(optionName: string) {
    return optionName.at(PREFIX.length)?.toLowerCase() + optionName.substring(PREFIX.length + 1);
}
