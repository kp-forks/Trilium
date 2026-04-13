import type { ComponentChildren } from "preact";
import { CSSProperties } from "preact/compat";
import { openInAppHelpFromUrl } from "../../../../services/utils";
import ActionButton from "../../../react/ActionButton";

interface OptionsSectionProps {
    title?: ComponentChildren;
    children: ComponentChildren;
    noCard?: boolean;
    style?: CSSProperties;
    className?: string;
    helpUrl?: string;
}

export default function OptionsSection({ title, children, noCard, className, helpUrl, ...rest }: OptionsSectionProps) {
    return (
        <div className={`options-section ${noCard ? "tn-no-card" : ""} ${className ?? ""}`} {...rest}>
            {(title || helpUrl) && (
                <div className="options-section-header">
                    {title && <h4>{title}</h4>}
                    {helpUrl && (
                        <ActionButton
                            icon="bx bx-help-circle"
                            text="Help"
                            onClick={() => openInAppHelpFromUrl(helpUrl)}
                        />
                    )}
                </div>
            )}
            {children}
        </div>
    );
}
