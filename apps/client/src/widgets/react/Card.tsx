import "./Card.css";
import { ComponentChildren, createContext } from "preact";
import { JSX } from "preact";
import { useContext } from "preact/hooks";
import clsx from "clsx";

interface CardProps {
    className?: string;
    heading?: string;
}

export function Card(props: {children: ComponentChildren} & CardProps) {
    return <div class={clsx("tn-card", props.className)}>
        {props.heading && <h5 class="tn-card-heading">{props.heading}</h5>}
        <div className="tn-card-body">
            {props.children}
        </div>
    </div>;
}

interface CardSectionProps {
    className?: string;
    subSections?: JSX.Element | JSX.Element[];
    subSectionsVisible?: boolean;
    highlightOnHover?: boolean;
    onAction?: () => void;
}

export function CardSection(props: {children: ComponentChildren} & CardSectionProps) {
    const parentContext = useContext(CardSectionContext);
    const nestingLevel = (parentContext && parentContext.nestingLevel + 1) ?? 0;

    return <>
        <section className={clsx("tn-card-section", props.className, {
                    "tn-card-section-nested": nestingLevel > 0,
                    "tn-card-section-highlight-on-hover": props.highlightOnHover || props.onAction
                 })}
                 style={{"--tn-card-section-nesting-level": (nestingLevel) ? nestingLevel : null}}
                 onClick={props.onAction}>
            {props.children}
        </section>

        {props.subSectionsVisible &&
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