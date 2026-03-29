import { useCallback, useEffect, useState } from "preact/hooks";

import { t } from "../../../services/i18n.js";
import { useEditorSpacedUpdate } from "../../react/hooks.js";
import FormDropdownList from "../../react/FormDropdownList.js";
import { TypeWidgetProps } from "../type_widget.js";
import ChatMessage from "./ChatMessage.js";
import type { LlmChatContent } from "./llm_chat_types.js";
import { useLlmChat } from "./useLlmChat.js";
import "./LlmChat.css";

/** Format token count with thousands separators */
function formatTokenCount(tokens: number): string {
    return tokens.toLocaleString();
}

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

    const toggleWebSearch = useCallback(() => {
        chat.setEnableWebSearch(!chat.enableWebSearch);
        setShouldSave(true);
    }, [chat]);

    const toggleNoteTools = useCallback(() => {
        chat.setEnableNoteTools(!chat.enableNoteTools);
        setShouldSave(true);
    }, [chat]);

    const toggleExtendedThinking = useCallback(() => {
        chat.setEnableExtendedThinking(!chat.enableExtendedThinking);
        setShouldSave(true);
    }, [chat]);

    const handleModelChange = useCallback((newModel: string) => {
        chat.setSelectedModel(newModel);
        setShouldSave(true);
    }, [chat]);

    return (
        <div className="llm-chat-container">
            <div className="llm-chat-messages">
                {chat.messages.length === 0 && !chat.isStreaming && (
                    <div className="llm-chat-empty">
                        {t("llm_chat.empty_state")}
                    </div>
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
            <form className="llm-chat-input-form" onSubmit={chat.handleSubmit}>
                <div className="llm-chat-input-row">
                    <textarea
                        ref={chat.textareaRef}
                        className="llm-chat-input"
                        value={chat.input}
                        onInput={(e) => chat.setInput((e.target as HTMLTextAreaElement).value)}
                        placeholder={t("llm_chat.placeholder")}
                        disabled={chat.isStreaming}
                        onKeyDown={chat.handleKeyDown}
                        rows={3}
                    />
                    <button
                        type="submit"
                        className="llm-chat-send-btn"
                        disabled={chat.isStreaming || !chat.input.trim()}
                    >
                        {chat.isStreaming ? t("llm_chat.sending") : t("llm_chat.send")}
                    </button>
                </div>
                <div className="llm-chat-options">
                    <div className="llm-chat-model-selector">
                        <span className="bx bx-chip" />
                        <FormDropdownList
                            values={chat.availableModels}
                            keyProperty="id"
                            titleProperty="name"
                            descriptionProperty="costDescription"
                            currentValue={chat.selectedModel}
                            onChange={handleModelChange}
                            disabled={chat.isStreaming}
                            buttonClassName="llm-chat-model-select"
                        />
                    </div>
                    <label className="llm-chat-toggle">
                        <input
                            type="checkbox"
                            checked={chat.enableWebSearch}
                            onChange={toggleWebSearch}
                            disabled={chat.isStreaming}
                        />
                        <span className="bx bx-globe" />
                        {t("llm_chat.web_search")}
                    </label>
                    <label className="llm-chat-toggle">
                        <input
                            type="checkbox"
                            checked={chat.enableNoteTools}
                            onChange={toggleNoteTools}
                            disabled={chat.isStreaming}
                        />
                        <span className="bx bx-note" />
                        {t("llm_chat.note_tools")}
                    </label>
                    <label className="llm-chat-toggle">
                        <input
                            type="checkbox"
                            checked={chat.enableExtendedThinking}
                            onChange={toggleExtendedThinking}
                            disabled={chat.isStreaming}
                        />
                        <span className="bx bx-brain" />
                        {t("llm_chat.extended_thinking")}
                    </label>
                    {chat.lastPromptTokens > 0 && (() => {
                        const currentModel = chat.availableModels.find(m => m.id === chat.selectedModel);
                        const contextWindow = currentModel?.contextWindow || 200000;
                        const percentage = Math.min((chat.lastPromptTokens / contextWindow) * 100, 100);
                        const isWarning = percentage > 75;
                        const isCritical = percentage > 90;
                        const color = isCritical ? "var(--danger-color, #d9534f)" : isWarning ? "var(--warning-color, #f0ad4e)" : "var(--main-selection-color, #007bff)";

                        return (
                            <div
                                className="llm-chat-context-pie"
                                title={`${formatTokenCount(chat.lastPromptTokens)} / ${formatTokenCount(contextWindow)} ${t("llm_chat.tokens")} (${percentage.toFixed(0)}%)`}
                                style={{
                                    background: `conic-gradient(${color} ${percentage}%, var(--accented-background-color) ${percentage}%)`
                                }}
                            />
                        );
                    })()}
                </div>
            </form>
        </div>
    );
}
