import { ComponentChildren } from "preact";
import "./PropertySheet.css";

export function PropertySheet({ children }: { children: ComponentChildren }) {
    return <div className="property-sheet-table">
        {children} 
    </div>
}

export function PropertySheetItem({label, children}: {label: string, children: ComponentChildren}) {
    return <dl>
        <dt>{label}</dt>
        <dd>{children}</dd>
    </dl>
}