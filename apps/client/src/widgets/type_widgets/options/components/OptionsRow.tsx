import "./OptionsRow.css";

import { cloneElement, ComponentChildren, VNode } from "preact";

import Button from "../../../react/Button";
import FormToggle from "../../../react/FormToggle";
import { useUniqueName } from "../../../react/hooks";

interface OptionsRowProps {
    name: string;
    label?: ComponentChildren;
    description?: ComponentChildren;
    children: VNode;
    centered?: boolean;
    /** When true, stacks label above input with full-width input */
    stacked?: boolean;
}

export default function OptionsRow({ name, label, description, children, centered, stacked }: OptionsRowProps) {
    const id = useUniqueName(name);
    const childWithId = cloneElement(children, { id, name: (children.props as { name?: string }).name ?? name });

    const className = `option-row ${centered ? "centered" : ""} ${stacked ? "stacked" : ""}`;

    return (
        <div className={className}>
            <div className="option-row-label">
                {label && <label for={id}>{label}</label>}
                {description && <small className="option-row-description">{description}</small>}
            </div>
            <div className="option-row-input">
                {childWithId}
            </div>
        </div>
    );
}

interface OptionsRowLinkProps {
    label: string;
    description?: string;
    href: string;
    onClick?: (e: MouseEvent) => void;
    /** Opts out of the options dialog's contained link navigation (which runs before `onClick`),
     *  so that `onClick` gets to handle the click itself. */
    noContainedNavigation?: boolean;
}

export function OptionsRowLink({ label, description, href, onClick, noContainedNavigation }: OptionsRowLinkProps) {
    return (
        <a
            href={href}
            className="option-row option-row-link no-tooltip-preview"
            onClick={onClick}
            data-no-contained-navigation={noContainedNavigation ? "" : undefined}
        >
            <div className="option-row-label">
                <label style={{ cursor: "pointer" }}>{label}</label>
                {description && <small className="option-row-description">{description}</small>}
            </div>
            <div className="option-row-input">
                <span className="bx bx-chevron-right" />
            </div>
        </a>
    );
}

interface OptionsRowWithToggleProps {
    name: string;
    label: ComponentChildren;
    description?: ComponentChildren;
    currentValue: boolean | null;
    onChange: (newValue: boolean) => void;
    disabled?: boolean;
    helpPage?: string;
}

export function OptionsRowWithToggle({ name, label, description, currentValue, onChange, disabled, helpPage }: OptionsRowWithToggleProps) {
    return (
        <OptionsRow name={name} label={label} description={description}>
            <FormToggle
                switchOnName=""
                switchOffName=""
                currentValue={currentValue}
                onChange={onChange}
                disabled={disabled}
                helpPage={helpPage}
            />
        </OptionsRow>
    );
}

interface OptionsRowWithButtonProps {
    label: string;
    description?: string;
    icon?: string;
    disabled?: boolean;
    onClick: () => void;
    /**
     * The label of the action button. When set, the row renders as passive label/description text
     * with a discrete button on the right — the intuitive pattern. When omitted, the whole row is
     * clickable instead (legacy). In button mode `icon` is forwarded to the {@link Button}, so it
     * must be in `Button` format (e.g. `bx-refresh`, without the leading `bx `).
     */
    buttonText?: string;
}

export function OptionsRowWithButton({ label, description, icon, disabled, onClick, buttonText }: OptionsRowWithButtonProps) {
    if (buttonText) {
        return (
            <div className="option-row">
                <div className="option-row-label">
                    <label>{label}</label>
                    {description && <small className="option-row-description">{description}</small>}
                </div>
                <div className="option-row-input">
                    <Button text={buttonText} icon={icon} disabled={disabled} onClick={onClick} />
                </div>
            </div>
        );
    }

    return (
        <button
            type="button"
            className="option-row option-row-link"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
        >
            <div className="option-row-label">
                <span style={{ cursor: "pointer" }}>{label}</span>
                {description && <small className="option-row-description">{description}</small>}
            </div>
            {icon && (
                <div className="option-row-input">
                    <span className={icon} />
                </div>
            )}
        </button>
    );
}
