import { useMemo } from "preact/hooks";
import { marked } from "marked";
import { t } from "../../../services/i18n.js";
import type { Citation } from "../../../services/llm_chat.js";
import "./LlmChat.css";

// Configure marked for safe rendering
marked.setOptions({
    breaks: true, // Convert \n to <br>
    gfm: true // GitHub Flavored Markdown
});

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

    // Only render markdown for assistant messages
    const renderedContent = useMemo(() => {
        if (message.role === "assistant") {
            return marked.parse(message.content) as string;
        }
        return null;
    }, [message.content, message.role]);

    return (
        <div className={`llm-chat-message llm-chat-message-${message.role}`}>
            <div className="llm-chat-message-role">
                {roleLabel}
            </div>
            <div className="llm-chat-message-content">
                {message.role === "assistant" ? (
                    <>
                        <div
                            className="llm-chat-markdown"
                            dangerouslySetInnerHTML={{ __html: renderedContent || "" }}
                        />
                        {isStreaming && <span className="llm-chat-cursor" />}
                    </>
                ) : (
                    message.content
                )}
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
