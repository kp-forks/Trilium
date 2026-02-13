import "./Card.css";
import { ComponentChildren, createContext } from "preact";
import { JSX } from "preact";
import { useContext } from "preact/hooks";
import clsx from "clsx";

interface CardProps {
}

export function Card(props: {children: ComponentChildren} & CardProps) {
    return <div className="tn-card">
        {props.children}
    </div>;
}

interface CardSectionProps {
    subSections?: JSX.Element | JSX.Element[];
    childrenVisible?: boolean;
}

export function CardSection(props: {children: ComponentChildren} & CardSectionProps) {
    const parentContext = useContext(CardSectionContext);
    const nestingLevel = (parentContext && parentContext.nestingLevel + 1) ?? 0;

    return <>
        <section className={clsx(["tn-card-section", {"tn-card-section-nested": nestingLevel > 0}])}
                 style={"--tn-card-section-nesting-level: " + nestingLevel}>
            {props.children} {nestingLevel}
        </section>

        {props?.childrenVisible &&
            <CardSectionContext.Provider value={{nestingLevel}}>
                {props.subSections}
            </CardSectionContext.Provider>
        }
    </>;
}

interface CardSectionContextType {
    nestingLevel: number;
}

export const CardSectionContext = createContext<CardSectionContextType | undefined>(undefined);