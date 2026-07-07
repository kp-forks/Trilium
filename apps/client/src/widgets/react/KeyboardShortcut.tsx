import { ActionKeyboardShortcut, KeyboardActionNames } from "@triliumnext/commons";
import { useEffect, useState } from "preact/hooks";
import keyboard_actions from "../../services/keyboard_actions";
import { formatShortcutLocalized } from "../../services/keyboard_shortcut_display";
import { joinElements } from "./react_utils";
import utils from "../../services/utils";

interface KeyboardShortcutProps {
    actionName: KeyboardActionNames;
}

const isMobile = utils.isMobile();

export default function KeyboardShortcut({ actionName }: KeyboardShortcutProps) {

    const [ action, setAction ] = useState<ActionKeyboardShortcut>();
    useEffect(() => {
        keyboard_actions.getAction(actionName).then(setAction);
    }, []);

    if (!action) {
        return <></>;
    }

    return (!isMobile &&
        <span className="keyboard-shortcut">
            {joinElements(action.effectiveShortcuts?.map((shortcut) =>
                joinElements(formatShortcutLocalized(shortcut).map((key) => <kbd>{key}</kbd>), "+")
            ))}
        </span>
    );
}