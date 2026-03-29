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

type MessageType = "message" | "error" | "thinking";

interface StoredMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
    citations?: Citation[];
    /** Message type for special rendering. Defaults to "message" if omitted. */
    type?: MessageType;
}

interface Props {
    message: StoredMessage;
    isStreaming?: boolean;
}

export default function ChatMessage({ message, isStreaming }: Props) {
    const roleLabel = message.role === "user" ? "You" : "Assistant";
    const isError = message.type === "error";
    const isThinking = message.type === "thinking";

    // Render markdown for assistant messages (not errors or thinking)
    const renderedContent = useMemo(() => {
        if (message.role === "assistant" && !isError && !isThinking) {
            return marked.parse(message.content) as string;
        }
        return null;
    }, [message.content, message.role, isError, isThinking]);

    const messageClasses = [
        "llm-chat-message",
        `llm-chat-message-${message.role}`,
        isError && "llm-chat-message-error",
        isThinking && "llm-chat-message-thinking"
    ].filter(Boolean).join(" ");

    // Render thinking messages in a collapsible details element
    if (isThinking) {
        return (
            <details className={messageClasses}>
                <summary className="llm-chat-thinking-summary">
                    <span className="bx bx-brain" />
                    {t("llm_chat.thought_process")}
                </summary>
                <div className="llm-chat-message-content llm-chat-thinking-content">
                    {message.content}
                    {isStreaming && <span className="llm-chat-cursor" />}
                </div>
            </details>
        );
    }

    return (
        <div className={messageClasses}>
            <div className="llm-chat-message-role">
                {isError ? "Error" : roleLabel}
            </div>
            <div className="llm-chat-message-content">
                {message.role === "assistant" && !isError ? (
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
                        {message.citations.map((citation, idx) => {
                            // Determine display text: title, URL hostname, or cited text
                            let displayText = citation.title;
                            if (!displayText && citation.url) {
                                try {
                                    displayText = new URL(citation.url).hostname;
                                } catch {
                                    displayText = citation.url;
                                }
                            }
                            if (!displayText) {
                                displayText = citation.citedText?.slice(0, 50) || `Source ${idx + 1}`;
                            }

                            return (
                                <li key={idx}>
                                    {citation.url ? (
                                        <a
                                            href={citation.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title={citation.citedText || citation.url}
                                        >
                                            {displayText}
                                        </a>
                                    ) : (
                                        <span title={citation.citedText}>
                                            {displayText}
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
