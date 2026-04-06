import { cloneElement, VNode } from "preact";
import "./OptionsRow.css";
import { useUniqueName } from "../../../react/hooks";

interface OptionsRowProps {
    name: string;
    label?: string;
    description?: string;
    children: VNode;
    centered?: boolean;
    fullWidth?: boolean;
}

export default function OptionsRow({ name, label, description, children, centered, fullWidth }: OptionsRowProps) {
    const id = useUniqueName(name);
    const childWithId = cloneElement(children, { id });

    return (
        <div className={`option-row ${centered ? "centered" : ""} ${fullWidth ? "full-width" : ""}`}>
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