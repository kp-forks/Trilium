import { t } from "../../../services/i18n.js";
import type { Citation } from "../../../services/llm_chat.js";
import "./LlmChat.css";

interface StoredMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
    citations?: Citation[];
}

interface Props {
    message: StoredMessage;
    isStreaming?: boolean;
}

export default function ChatMessage({ message, isStreaming }: Props) {
    const roleLabel = message.role === "user" ? "You" : "Assistant";

    return (
        <div className={`llm-chat-message llm-chat-message-${message.role}`}>
            <div className="llm-chat-message-role">
                {roleLabel}
            </div>
            <div className="llm-chat-message-content">
                {message.content}
                {isStreaming && <span className="llm-chat-cursor" />}
            </div>
            {message.citations && message.citations.length > 0 && (
                <div className="llm-chat-citations">
                    <div className="llm-chat-citations-label">
                        <span className="bx bx-link" />
                        {t("llm_chat.sources")}
                    </div>
                    <ul className="llm-chat-citations-list">
                        {message.citations.map((citation, idx) => (
                            <li key={idx}>
                                <a
                                    href={citation.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={citation.url}
                                >
                                    {citation.title || new URL(citation.url).hostname}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
