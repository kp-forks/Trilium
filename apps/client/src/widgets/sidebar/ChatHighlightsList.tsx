import "./ChatHighlightsList.css";

import { t } from "../../services/i18n";
import ActionButton from "../react/ActionButton";
import { useGetContextData } from "../react/hooks";
import RightPanelWidget from "./RightPanelWidget";

/**
 * Sidebar list of the user's highlights in the active AI chat. The data (and the scroll/remove
 * actions) are published by {@link useChatHighlights} into the note context; this widget only renders.
 */
export default function ChatHighlightsList() {
    const data = useGetContextData("chatHighlights");
    const highlights = data?.highlights ?? [];

    return (
        <RightPanelWidget id="chat-highlights" title={t("llm_chat.highlights_title", { count: highlights.length })} grow>
            <span className="chat-highlights-list">
                {highlights.length > 0 ? (
                    <ol>
                        {highlights.map(highlight => (
                            <li key={highlight.id} onClick={() => data?.scrollToHighlight(highlight.id)}>
                                <span className="chat-highlight-text">{highlight.text}</span>
                                <ActionButton
                                    className="chat-highlight-remove"
                                    icon="bx bx-x"
                                    text={t("llm_chat.highlight_remove")}
                                    onClick={e => {
                                        e.stopPropagation();
                                        data?.removeHighlight(highlight.id);
                                    }}
                                />
                            </li>
                        ))}
                    </ol>
                ) : (
                    <div className="no-highlights">{t("llm_chat.highlights_empty")}</div>
                )}
            </span>
        </RightPanelWidget>
    );
}
