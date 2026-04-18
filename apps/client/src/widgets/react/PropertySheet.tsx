import { ComponentChildren } from "preact";
import clsx from "clsx";
import "./PropertySheet.css";
import { FluidWrapper } from "./FluidWrapper";

interface PropertySheetParams {
    className?: string;
    children: ComponentChildren;
    wideLayoutBreakpoint?: number;
}

export function PropertySheet({ className, children, wideLayoutBreakpoint }: PropertySheetParams) {
    return <FluidWrapper
                className="property-sheet-container"
                breakpoints={{narrow: 0, wide: wideLayoutBreakpoint || 600}}>

        <div className={clsx("property-sheet", className)}>
            {children} 
        </div>
    </FluidWrapper>
}

export function PropertySheetItem({className, label, children}: {className?: string, label: string, children: ComponentChildren}) {
    return <dl>
        <dt>{label}</dt>
        <dd className={className}>{children}</dd>
    </dl>
}