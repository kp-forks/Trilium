import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import dateNoteService from "../../services/date_notes.js";
import { t } from "../../services/i18n.js";
import server from "../../services/server.js";
import ActionButton from "../react/ActionButton.js";
import NoItems from "../react/NoItems.js";
import ChatMessage from "../type_widgets/llm_chat/ChatMessage.js";
import type { LlmChatContent } from "../type_widgets/llm_chat/llm_chat_types.js";
import { useLlmChat } from "../type_widgets/llm_chat/useLlmChat.js";
import RightPanelWidget from "./RightPanelWidget.js";
import "./SidebarChat.css";

/**
 * Sidebar chat widget that appears in the right panel.
 * Uses a hidden LLM chat note for persistence across all notes.
 * The same chat persists when switching between notes.
 */
export default function SidebarChat() {
    const [chatNoteId, setChatNoteId] = useState<string | null>(null);
    const [shouldSave, setShouldSave] = useState(false);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

    // Use shared chat hook with sidebar-specific options
    const chat = useLlmChat(
        // onMessagesChange - trigger save
        () => setShouldSave(true),
        { defaultEnableNoteTools: true, supportsExtendedThinking: false }
    );

    // Ref to access chat methods in effects without triggering re-runs
    const chatRef = useRef(chat);
    chatRef.current = chat;

    // Handle debounced save when shouldSave is triggered
    useEffect(() => {
        if (!shouldSave || !chatNoteId) {
            setShouldSave(false);
            return;
        }

        setShouldSave(false);

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(async () => {
            const content = chat.getContent();
            try {
                await server.put(`notes/${chatNoteId}/data`, {
                    content: JSON.stringify(content)
                });
            } catch (err) {
                console.error("Failed to save chat:", err);
            }
        }, 500);
    }, [shouldSave, chatNoteId, chat]);

    // Load the most recent chat on mount (runs once)
    useEffect(() => {
        let cancelled = false;

        const loadMostRecentChat = async () => {
            try {
                const existingChat = await dateNoteService.getMostRecentLlmChat();

                if (cancelled) return;

                if (existingChat) {
                    setChatNoteId(existingChat.noteId);
                    // Load content inline to avoid dependency issues
                    try {
                        const blob = await server.get<{ content: string }>(`notes/${existingChat.noteId}/blob`);
                        if (!cancelled && blob?.content) {
                            const parsed: LlmChatContent = JSON.parse(blob.content);
                            chatRef.current.loadFromContent(parsed);
                        }
                    } catch (err) {
                        console.error("Failed to load chat content:", err);
                    }
                } else {
                    // No existing chat - will create on first message
                    setChatNoteId(null);
                    chatRef.current.clearMessages();
                }
            } catch (err) {
                console.error("Failed to load sidebar chat:", err);
            }
        };

        loadMostRecentChat();

        return () => {
            cancelled = true;
        };
    }, []);

    // Custom submit handler that ensures chat note exists first
    const handleSubmit = useCallback(async (e: Event) => {
        e.preventDefault();
        if (!chat.input.trim() || chat.isStreaming) return;

        // Ensure chat note exists before sending (lazy creation)
        let noteId = chatNoteId;
        if (!noteId) {
            try {
                const note = await dateNoteService.getOrCreateLlmChat();
                if (note) {
                    setChatNoteId(note.noteId);
                    noteId = note.noteId;
                }
            } catch (err) {
                console.error("Failed to create sidebar chat:", err);
                return;
            }
        }

        if (!noteId) {
            console.error("Cannot send message: no chat note available");
            return;
        }

        // Delegate to shared handler
        await chat.handleSubmit(e);
    }, [chatNoteId, chat]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    }, [handleSubmit]);

    const handleNewChat = useCallback(async () => {
        try {
            const note = await dateNoteService.createLlmChat();
            if (note) {
                setChatNoteId(note.noteId);
                chat.clearMessages();
            }
        } catch (err) {
            console.error("Failed to create new chat:", err);
        }
    }, [chat]);

    const handleSaveChat = useCallback(async () => {
        if (!chatNoteId) return;
        try {
            await server.post("special-notes/save-llm-chat", { llmChatNoteId: chatNoteId });
            // Create a new empty chat after saving
            const note = await dateNoteService.createLlmChat();
            if (note) {
                setChatNoteId(note.noteId);
                chat.clearMessages();
            }
        } catch (err) {
            console.error("Failed to save chat to permanent location:", err);
        }
    }, [chatNoteId, chat]);

    return (
        <RightPanelWidget
            id="sidebar-chat"
            title={t("sidebar_chat.title")}
            grow
            buttons={
                <>
                    <ActionButton
                        icon="bx bx-plus"
                        text=""
                        title={t("sidebar_chat.new_chat")}
                        onClick={handleNewChat}
                    />
                    <ActionButton
                        icon="bx bx-save"
                        text=""
                        title={t("sidebar_chat.save_chat")}
                        onClick={handleSaveChat}
                        disabled={chat.messages.length === 0}
                    />
                </>
            }
        >
            <div className="sidebar-chat-container">
                <div className="sidebar-chat-messages">
                    {chat.messages.length === 0 && !chat.isStreaming && (
                        <NoItems
                            icon="bx bx-conversation"
                            text={t("sidebar_chat.empty_state")}
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
                <div className="sidebar-chat-input-area">
                    <textarea
                        ref={chat.textareaRef}
                        className="sidebar-chat-input"
                        value={chat.input}
                        onInput={(e) => chat.setInput((e.target as HTMLTextAreaElement).value)}
                        placeholder={t("llm_chat.placeholder")}
                        disabled={chat.isStreaming}
                        onKeyDown={handleKeyDown}
                        rows={2}
                    />
                    <div className="sidebar-chat-actions">
                        <div className="sidebar-chat-options">
                            <label className="sidebar-chat-toggle" title={t("llm_chat.web_search")}>
                                <input
                                    type="checkbox"
                                    checked={chat.enableWebSearch}
                                    onChange={() => chat.setEnableWebSearch(!chat.enableWebSearch)}
                                    disabled={chat.isStreaming}
                                />
                                <span className="bx bx-globe" />
                            </label>
                            <label className="sidebar-chat-toggle" title={t("llm_chat.note_tools")}>
                                <input
                                    type="checkbox"
                                    checked={chat.enableNoteTools}
                                    onChange={() => chat.setEnableNoteTools(!chat.enableNoteTools)}
                                    disabled={chat.isStreaming}
                                />
                                <span className="bx bx-note" />
                            </label>
                        </div>
                        <button
                            type="button"
                            className="sidebar-chat-send-btn"
                            disabled={chat.isStreaming || !chat.input.trim()}
                            onClick={handleSubmit}
                        >
                            <span className="bx bx-send" />
                        </button>
                    </div>
                </div>
            </div>
        </RightPanelWidget>
    );
}
