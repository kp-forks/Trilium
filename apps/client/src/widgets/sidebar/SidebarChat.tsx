import "./SidebarChat.css";

import type { Dropdown as BootstrapDropdown } from "bootstrap";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import dateNoteService, { type RecentLlmChat } from "../../services/date_notes.js";
import { t } from "../../services/i18n.js";
import server from "../../services/server.js";
import ActionButton from "../react/ActionButton.js";
import Dropdown from "../react/Dropdown.js";
import { FormListItem } from "../react/FormList.js";
import { useActiveNoteContext, useNote, useNoteProperty } from "../react/hooks.js";
import NoItems from "../react/NoItems.js";
import ChatInputBar from "../type_widgets/llm_chat/ChatInputBar.js";
import ChatMessage from "../type_widgets/llm_chat/ChatMessage.js";
import type { LlmChatContent } from "../type_widgets/llm_chat/llm_chat_types.js";
import { useLlmChat } from "../type_widgets/llm_chat/useLlmChat.js";
import RightPanelWidget from "./RightPanelWidget.js";

/**
 * Sidebar chat widget that appears in the right panel.
 * Uses a hidden LLM chat note for persistence across all notes.
 * The same chat persists when switching between notes.
 */
export default function SidebarChat() {
    const [chatNoteId, setChatNoteId] = useState<string | null>(null);
    const [shouldSave, setShouldSave] = useState(false);
    const [recentChats, setRecentChats] = useState<RecentLlmChat[]>([]);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
    const historyDropdownRef = useRef<BootstrapDropdown | null>(null);

    // Get the current active note context
    const { noteId: activeNoteId, note: activeNote } = useActiveNoteContext();

    // Reactively watch the chat note's title (updates via WebSocket sync after auto-rename)
    const chatNote = useNote(chatNoteId);
    const chatTitle = useNoteProperty(chatNote, "title") || t("sidebar_chat.title");

    // Use shared chat hook with sidebar-specific options
    const chat = useLlmChat(
        // onMessagesChange - trigger save
        () => setShouldSave(true),
        { defaultEnableNoteTools: true, supportsExtendedThinking: true }
    );

    // Update chat context when active note changes
    useEffect(() => {
        chat.setContextNoteId(activeNoteId ?? undefined);
    }, [activeNoteId, chat.setContextNoteId]);

    // Sync chatNoteId into the hook for auto-title generation
    useEffect(() => {
        chat.setChatNoteId(chatNoteId ?? undefined);
    }, [chatNoteId, chat.setChatNoteId]);

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

        // Ensure the hook has the chatNoteId before submitting (state update from
        // setChatNoteId above won't be visible until next render)
        chat.setChatNoteId(noteId);

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

    const loadRecentChats = useCallback(async () => {
        try {
            const chats = await dateNoteService.getRecentLlmChats(10);
            setRecentChats(chats);
        } catch (err) {
            console.error("Failed to load recent chats:", err);
        }
    }, []);

    const handleSelectChat = useCallback(async (noteId: string) => {
        historyDropdownRef.current?.hide();

        if (noteId === chatNoteId) return;

        try {
            const blob = await server.get<{ content: string }>(`notes/${noteId}/blob`);
            if (blob?.content) {
                const parsed: LlmChatContent = JSON.parse(blob.content);
                setChatNoteId(noteId);
                chat.loadFromContent(parsed);
            }
        } catch (err) {
            console.error("Failed to load selected chat:", err);
        }
    }, [chatNoteId, chat]);

    return (
        <RightPanelWidget
            id="sidebar-chat"
            title={chatTitle}
            grow
            buttons={
                <>
                    <ActionButton
                        icon="bx bx-plus"
                        text={t("sidebar_chat.new_chat")}
                        onClick={handleNewChat}
                    />
                    <Dropdown
                        text=""
                        buttonClassName="bx bx-history"
                        title={t("sidebar_chat.history")}
                        iconAction
                        hideToggleArrow
                        dropdownContainerClassName="tn-dropdown-menu-scrollable"
                        dropdownOptions={{ popperConfig: { strategy: "fixed" } }}
                        dropdownRef={historyDropdownRef}
                        onShown={loadRecentChats}
                    >
                        {recentChats.length === 0 ? (
                            <FormListItem disabled>
                                {t("sidebar_chat.no_chats")}
                            </FormListItem>
                        ) : (
                            recentChats.map(chatItem => (
                                <FormListItem
                                    key={chatItem.noteId}
                                    icon="bx bx-message-square-dots"
                                    className={chatItem.noteId === chatNoteId ? "active" : ""}
                                    onClick={() => handleSelectChat(chatItem.noteId)}
                                >
                                    <div className="sidebar-chat-history-item-content">
                                        {chatItem.noteId === chatNoteId
                                            ? <strong>{chatItem.title}</strong>
                                            : <span>{chatItem.title}</span>}
                                        <span className="sidebar-chat-history-date">
                                            {new Date(chatItem.dateModified).toLocaleDateString()}
                                        </span>
                                    </div>
                                </FormListItem>
                            ))
                        )}
                    </Dropdown>
                    <ActionButton
                        icon="bx bx-save"
                        text={t("sidebar_chat.save_chat")}
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
                <ChatInputBar
                    chat={chat}
                    rows={2}
                    activeNoteId={activeNoteId ?? undefined}
                    activeNoteTitle={activeNote?.title}
                    onSubmit={handleSubmit}
                    onKeyDown={handleKeyDown}
                />
            </div>
        </RightPanelWidget>
    );
}
