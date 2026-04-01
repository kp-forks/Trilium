import { cloneElement, VNode } from "preact";
import "./OptionsRow.css";
import { useUniqueName } from "../../../react/hooks";

interface OptionsRowProps {
    name: string;
    label?: string;
    description?: string;
    children: VNode;
    centered?: boolean;
}

export default function OptionsRow({ name, label, description, children, centered }: OptionsRowProps) {
    const id = useUniqueName(name);
    const childWithId = cloneElement(children, { id });

    return (
        <div className={`option-row ${centered ? "centered" : ""}`}>
            <div className="option-row-main">
                {label && <label for={id}>{label}</label>}
                {childWithId}
            </div>
            {description && <small className="option-row-description">{description}</small>}
        </div>
    );
}