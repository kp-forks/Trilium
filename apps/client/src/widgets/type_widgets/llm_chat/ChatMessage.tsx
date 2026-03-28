import "./LlmChat.css";

interface StoredMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
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
        </div>
    );
}
