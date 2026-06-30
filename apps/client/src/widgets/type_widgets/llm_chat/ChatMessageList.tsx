import "./ChatMessageList.css";

import { t } from "../../../services/i18n.js";
import ActionButton from "../../react/ActionButton.js";
import NoItems from "../../react/NoItems.js";
import ChatMessage from "./ChatMessage.js";
import type { UseLlmChatReturn } from "./useLlmChat.js";

interface ChatMessageListProps {
    /** The chat hook result. */
    chat: UseLlmChatReturn;
    /** Placeholder text shown when there are no messages yet. */
    emptyStateText: string;
    /** Extra class on the scroll container for widget-specific styling. */
    className?: string;
}

/**
 * Renders the scrollable chat message timeline: stored messages (with retry
 * wiring on a trailing error), in-progress streaming placeholders and the
 * scroll anchor. Shared by the chat note type widget and the sidebar chat.
 */
export default function ChatMessageList({ chat, emptyStateText, className }: ChatMessageListProps) {
    return (
        <div className="chat-message-list-wrapper">
            <div className={`chat-message-list ${className ?? ""}`} ref={chat.scrollContainerRef}>
                {chat.messages.length === 0 && !chat.isStreaming && (
                    <NoItems icon="bx bx-conversation" text={emptyStateText} />
                )}
                {chat.messages.map((msg, idx) => (
                    <ChatMessage
                        key={msg.id}
                        message={msg}
                        onRetry={
                            idx === chat.messages.length - 1 && msg.type === "error" && !chat.isStreaming
                                ? chat.retryLast
                                : undefined
                        }
                    />
                ))}
                {chat.isStreaming && chat.streamingThinking && (
                    <ChatMessage
                        message={{
                            id: "streaming-thinking",
                            role: "assistant",
                            content: chat.streamingThinking,
                            createdAt: new Date().toISOString(),
                            type: "thinking"
                        }}
                        isStreaming
                    />
                )}
                {chat.isStreaming && chat.streamingBlocks.length > 0 && (
                    <ChatMessage
                        message={{
                            id: "streaming",
                            role: "assistant",
                            content: chat.streamingBlocks,
                            createdAt: new Date().toISOString(),
                            citations: chat.pendingCitations.length > 0 ? chat.pendingCitations : undefined
                        }}
                        isStreaming
                    />
                )}
                <div ref={chat.messagesEndRef} />
                <div ref={chat.bottomSpacerRef} className="chat-bottom-spacer" aria-hidden="true" />
            </div>
            {chat.showScrollToBottom && (
                <ActionButton
                    className="chat-scroll-to-bottom"
                    icon="bx bx-chevron-down"
                    text={t("llm_chat.scroll_to_bottom")}
                    titlePosition="top"
                    onClick={chat.scrollToBottom}
                />
            )}
        </div>
    );
}
