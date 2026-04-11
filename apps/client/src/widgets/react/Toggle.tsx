import clsx from "clsx";
import "./Toggle.css";
import { useEffect, useState } from "preact/hooks";

interface ToggleProps {
    currentValue: boolean;
    onChange(newValue: boolean): void;
    disabled?: boolean;
    id?: string;
}

/**
 * A simple toggle switch without labels. For use with OptionsRow or other
 * contexts where the label is provided separately.
 */
export default function Toggle({ currentValue, onChange, disabled, id }: ToggleProps) {
    const [disableTransition, setDisableTransition] = useState(true);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setDisableTransition(false);
        }, 100);
        return () => clearTimeout(timeout);
    }, []);

    return (
        <label className="tn-toggle">
            <div
                className={clsx("tn-toggle-track", {
                    on: currentValue,
                    disabled,
                    "disable-transitions": disableTransition
                })}
            >
                <input
                    id={id}
                    className="tn-toggle-input"
                    type="checkbox"
                    checked={currentValue}
                    onInput={(e) => {
                        onChange(!currentValue);
                        e.preventDefault();
                    }}
                    disabled={disabled}
                />
            </div>
        </label>
    );
}
