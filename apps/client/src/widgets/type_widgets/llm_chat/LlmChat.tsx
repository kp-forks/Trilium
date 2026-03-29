import { useCallback, useEffect, useState } from "preact/hooks";

import { t } from "../../../services/i18n.js";
import NoItems from "../../react/NoItems.js";
import { useEditorSpacedUpdate } from "../../react/hooks.js";
import { TypeWidgetProps } from "../type_widget.js";
import ChatInputBar from "./ChatInputBar.js";
import ChatMessage from "./ChatMessage.js";
import type { LlmChatContent } from "./llm_chat_types.js";
import { useLlmChat } from "./useLlmChat.js";
import "./LlmChat.css";

export default function LlmChat({ note, ntxId, noteContext }: TypeWidgetProps) {
    const [shouldSave, setShouldSave] = useState(false);

    const chat = useLlmChat(
        // onMessagesChange - trigger save
        () => setShouldSave(true),
        { defaultEnableNoteTools: false, supportsExtendedThinking: true }
    );

    const spacedUpdate = useEditorSpacedUpdate({
        note,
        noteType: "llmChat",
        noteContext,
        getData: () => {
            const content = chat.getContent();
            return { content: JSON.stringify(content) };
        },
        onContentChange: (content) => {
            if (!content) {
                chat.clearMessages();
                return;
            }
            try {
                const parsed: LlmChatContent = JSON.parse(content);
                chat.loadFromContent(parsed);
            } catch (e) {
                console.error("Failed to parse LLM chat content:", e);
                chat.clearMessages();
            }
        }
    });

    // Trigger save after state updates when shouldSave is set
    useEffect(() => {
        if (shouldSave) {
            setShouldSave(false);
            spacedUpdate.scheduleUpdate();
        }
    }, [shouldSave, spacedUpdate]);

    const triggerSave = useCallback(() => {
        setShouldSave(true);
    }, []);

    return (
        <div className="llm-chat-container">
            <div className="llm-chat-messages">
                {chat.messages.length === 0 && !chat.isStreaming && (
                    <NoItems
                        icon="bx bx-conversation"
                        text={t("llm_chat.empty_state")}
                    />
                )}
                {chat.messages.map(msg => (
                    <ChatMessage key={msg.id} message={msg} />
                ))}
                {chat.toolActivity && !chat.streamingThinking && (
                    <div className="llm-chat-tool-activity">
                        <span className="llm-chat-tool-spinner" />
                        {chat.toolActivity}
                    </div>
                )}
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
                {chat.isStreaming && chat.streamingContent && (
                    <ChatMessage
                        message={{
                            id: "streaming",
                            role: "assistant",
                            content: chat.streamingContent,
                            createdAt: new Date().toISOString(),
                            citations: chat.pendingCitations.length > 0 ? chat.pendingCitations : undefined
                        }}
                        isStreaming
                    />
                )}
                <div ref={chat.messagesEndRef} />
            </div>
            <ChatInputBar
                chat={chat}
                onWebSearchChange={triggerSave}
                onNoteToolsChange={triggerSave}
                onExtendedThinkingChange={triggerSave}
                onModelChange={triggerSave}
            />
        </div>
    );
}
