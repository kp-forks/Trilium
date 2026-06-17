import "./OptionsPageHeader.css";

import { ComponentChildren, createContext } from "preact";
import { useContext } from "preact/hooks";

import { useNoteContext } from "../../../react/hooks";

/**
 * Whether an options page's header should render the page title and icon. The settings dialog sets
 * this to `true` on desktop/tablet, where it hides the note's own title chrome and the page header
 * is the only place the title appears. It stays `false` standalone (the note's normal title chrome
 * already shows the title) and in the dialog's mobile master-detail flow (the modal header shows it
 * there), so the header renders only its actions in those cases.
 */
export const ShowOptionsPageTitleContext = createContext(false);

interface OptionsPageHeaderProps {
    /**
     * Page-specific controls shown on the title row — e.g. a master enable toggle or, for the
     * shortcuts page, the conflicts badge and reset buttons.
     */
    actions?: ComponentChildren;
    /**
     * Content shown on its own full-width row beneath the title row but still inside the header bar
     * — e.g. the shortcuts page's filter/search box.
     */
    below?: ComponentChildren;
}

/**
 * The header banner an options page renders at the top of its content. It shows the page title and
 * icon (when {@link ShowOptionsPageTitleContext} is set) beside any page-defined
 * {@link OptionsPageHeaderProps.actions}, with optional {@link OptionsPageHeaderProps.below} content
 * on a full-width row underneath. The same component is used in the settings dialog (where it sticks
 * to the top as a full-width bar — see the `.modal.options-dialog` styling) and standalone in a tab
 * (`.note-split.options`), so each page owns its header in both contexts.
 */
export default function OptionsPageHeader({ actions, below }: OptionsPageHeaderProps) {
    const { note } = useNoteContext();
    const showTitle = useContext(ShowOptionsPageTitleContext);
    const titleNote = showTitle ? note : null;

    // Nothing to render: no title belongs here and the page provided no content.
    if (!titleNote && !actions && !below) return null;

    return (
        <div className="options-page-header">
            <div className="options-page-header-inner">
                {(titleNote || actions) && (
                    <div className="options-page-header-main">
                        {titleNote && (
                            <div className="options-page-header-titles">
                                <span className={`options-page-header-icon ${titleNote.getIcon()}`} aria-hidden="true" />
                                <h2 className="options-page-header-title">{titleNote.title}</h2>
                            </div>
                        )}
                        {actions && <div className="options-page-header-actions">{actions}</div>}
                    </div>
                )}
                {below && <div className="options-page-header-below">{below}</div>}
            </div>
        </div>
    );
}
