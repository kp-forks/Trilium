import { cloneElement, VNode } from "preact";
import "./OptionsRow.css";
import { useUniqueName } from "../../../react/hooks";

interface OptionsRowProps {
    name: string;
    label?: string;
    children: VNode;
    centered?: boolean;
}

export default function OptionsRow({ name, label, children, centered }: OptionsRowProps) {
    const id = useUniqueName(name);
    const childWithId = cloneElement(children, { id });

    return (
        <div className={`option-row ${centered ? "centered" : ""}`}>
            {label && <label for={id}>{label}</label>}
            {childWithId}
        </div>
    );
}