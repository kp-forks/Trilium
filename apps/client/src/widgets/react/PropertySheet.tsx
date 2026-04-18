import { ComponentChildren } from "preact";
import clsx from "clsx";
import "./PropertySheet.css";

export function PropertySheet({ className, children }: { className?: string, children: ComponentChildren }) {
    return <div className={clsx("property-sheet-table", className)}>
        {children} 
    </div>
}

export function PropertySheetItem({className, label, children}: {className?: string, label: string, children: ComponentChildren}) {
    return <dl>
        <dt>{label}</dt>
        <dd className={className}>{children}</dd>
    </dl>
}