import type { LlmCitation, LlmMessage, LlmModelInfo, LlmUsage } from "@triliumnext/commons";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import appContext from "../../components/app_context.js";
import dateNoteService from "../../services/date_notes.js";
import { t } from "../../services/i18n.js";
import { getAvailableModels, streamChatCompletion } from "../../services/llm_chat.js";
import options from "../../services/options.js";
import server from "../../services/server.js";
import { randomString } from "../../services/utils.js";
import ActionButton from "../react/ActionButton.js";
import { useTriliumEvent } from "../react/hooks.js";
import ChatMessage from "../type_widgets/llm_chat/ChatMessage.js";
import RightPanelWidget from "./RightPanelWidget.js";
import "./SidebarChat.css";

type MessageType = "message" | "error" | "thinking";

interface ToolCall {
    id: string;
    toolName: string;
    input: Record<string, unknown>;
    result?: string;
}

interface StoredMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
    citations?: LlmCitation[];
    type?: MessageType;
    toolCalls?: ToolCall[];
    usage?: LlmUsage;
}

interface LlmChatContent {
    version: 1;
    messages: StoredMessage[];
    selectedModel?: string;
    enableWebSearch?: boolean;
    enableNoteTools?: boolean;
    enableExtendedThinking?: boolean;
}

interface ModelOption extends LlmModelInfo {
    costDescription?: string;
}

/**
 * Sidebar chat widget that appears in the right panel.
 * Uses a hidden LLM chat note for persistence.
 */
export default function SidebarChat() {
    const [visible, setVisible] = useState(false);
    const [chatNoteId, setChatNoteId] = useState<string | null>(null);
    const [messages, setMessages] = useState<StoredMessage[]>([]);
    const [input, setInput] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState("");
    const [streamingThinking, setStreamingThinking] = useState("");
    const [toolActivity, setToolActivity] = useState<string | null>(null);
    const [pendingCitations, setPendingCitations] = useState<LlmCitation[]>([]);
    const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>("");
    const [enableWebSearch, setEnableWebSearch] = useState(true);
    const [enableNoteTools, setEnableNoteTools] = useState(true); // Default true for sidebar
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

    // Listen for toggle event
    useTriliumEvent("toggleSidebarChat", useCallback(() => {
        setVisible(v => {
            const newValue = !v;
            if (newValue && !chatNoteId) {
                // Create a new chat when first opened
                initializeChat();
            }
            return newValue;
        });
    }, [chatNoteId]));

    // Listen for open event (always opens, creates chat if needed)
    useTriliumEvent("openSidebarChat", useCallback(() => {
        setVisible(true);
        if (!chatNoteId) {
            initializeChat();
        }
        // Ensure right pane is visible
        if (!options.is("rightPaneVisible")) {
            appContext.triggerEvent("toggleRightPane", {});
        }
    }, [chatNoteId]));

    // Fetch available models on mount
    useEffect(() => {
        getAvailableModels().then(models => {
            const modelsWithDescription = models.map(m => ({
                ...m,
                costDescription: m.costMultiplier ? `${m.costMultiplier}x cost` : undefined
            }));
            setAvailableModels(modelsWithDescription);
            if (!selectedModel) {
                const defaultModel = models.find(m => m.isDefault) || models[0];
                if (defaultModel) {
                    setSelectedModel(defaultModel.id);
                }
            }
        }).catch(err => {
            console.error("Failed to fetch available models:", err);
        });
    }, []);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingContent, streamingThinking, toolActivity, scrollToBottom]);

    const initializeChat = async () => {
        try {
            const note = await dateNoteService.createLlmChat();
            if (note) {
                setChatNoteId(note.noteId);
                setMessages([]);
            }
        } catch (err) {
            console.error("Failed to create sidebar chat:", err);
        }
    };

    const loadChatContent = async (noteId: string) => {
        try {
            const blob = await server.get<{ content: string }>(`notes/${noteId}/blob`);
            if (blob?.content) {
                const parsed: LlmChatContent = JSON.parse(blob.content);
                setMessages(parsed.messages || []);
                if (parsed.selectedModel) setSelectedModel(parsed.selectedModel);
                if (typeof parsed.enableWebSearch === "boolean") setEnableWebSearch(parsed.enableWebSearch);
                if (typeof parsed.enableNoteTools === "boolean") setEnableNoteTools(parsed.enableNoteTools);
            }
        } catch (err) {
            console.error("Failed to load chat content:", err);
        }
    };

    const saveChat = useCallback(async (updatedMessages: StoredMessage[]) => {
        if (!chatNoteId) return;

        // Clear any pending save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        // Debounce saves
        saveTimeoutRef.current = setTimeout(async () => {
            const content: LlmChatContent = {
                version: 1,
                messages: updatedMessages,
                selectedModel: selectedModel || undefined,
                enableWebSearch,
                enableNoteTools
            };

            try {
                await server.put(`notes/${chatNoteId}/data`, {
                    content: JSON.stringify(content)
                });
            } catch (err) {
                console.error("Failed to save chat:", err);
            }
        }, 500);
    }, [chatNoteId, selectedModel, enableWebSearch, enableNoteTools]);

    const handleSubmit = useCallback(async (e: Event) => {
        e.preventDefault();
        if (!input.trim() || isStreaming) return;

        setToolActivity(null);
        setPendingCitations([]);

        const userMessage: StoredMessage = {
            id: randomString(),
            role: "user",
            content: input.trim(),
            createdAt: new Date().toISOString()
        };

        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput("");
        setIsStreaming(true);
        setStreamingContent("");
        setStreamingThinking("");

        let assistantContent = "";
        let thinkingContent = "";
        const citations: LlmCitation[] = [];
        const toolCalls: ToolCall[] = [];
        let usage: LlmUsage | undefined;

        const apiMessages: LlmMessage[] = newMessages.map(m => ({
            role: m.role,
            content: m.content
        }));

        await streamChatCompletion(
            apiMessages,
            { model: selectedModel || undefined, enableWebSearch, enableNoteTools },
            {
                onChunk: (text) => {
                    assistantContent += text;
                    setStreamingContent(assistantContent);
                    setToolActivity(null);
                },
                onThinking: (text) => {
                    thinkingContent += text;
                    setStreamingThinking(thinkingContent);
                    setToolActivity(t("llm_chat.thinking"));
                },
                onToolUse: (toolName, toolInput) => {
                    const toolLabel = toolName === "web_search"
                        ? t("llm_chat.searching_web")
                        : `Using ${toolName}...`;
                    setToolActivity(toolLabel);
                    toolCalls.push({
                        id: randomString(),
                        toolName,
                        input: toolInput
                    });
                },
                onToolResult: (toolName, result) => {
                    const toolCall = [...toolCalls].reverse().find(tc => tc.toolName === toolName && !tc.result);
                    if (toolCall) {
                        toolCall.result = result;
                    }
                },
                onCitation: (citation) => {
                    citations.push(citation);
                    setPendingCitations([...citations]);
                },
                onUsage: (u) => {
                    usage = u;
                },
                onError: (errorMsg) => {
                    console.error("Chat error:", errorMsg);
                    const errorMessage: StoredMessage = {
                        id: randomString(),
                        role: "assistant",
                        content: errorMsg,
                        createdAt: new Date().toISOString(),
                        type: "error"
                    };
                    const finalMessages = [...newMessages, errorMessage];
                    setMessages(finalMessages);
                    saveChat(finalMessages);
                    setStreamingContent("");
                    setStreamingThinking("");
                    setIsStreaming(false);
                    setToolActivity(null);
                },
                onDone: () => {
                    const finalNewMessages: StoredMessage[] = [];

                    if (thinkingContent) {
                        finalNewMessages.push({
                            id: randomString(),
                            role: "assistant",
                            content: thinkingContent,
                            createdAt: new Date().toISOString(),
                            type: "thinking"
                        });
                    }

                    if (assistantContent || toolCalls.length > 0) {
                        finalNewMessages.push({
                            id: randomString(),
                            role: "assistant",
                            content: assistantContent,
                            createdAt: new Date().toISOString(),
                            citations: citations.length > 0 ? citations : undefined,
                            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                            usage
                        });
                    }

                    if (finalNewMessages.length > 0) {
                        const allMessages = [...newMessages, ...finalNewMessages];
                        setMessages(allMessages);
                        saveChat(allMessages);
                    }

                    setStreamingContent("");
                    setStreamingThinking("");
                    setPendingCitations([]);
                    setIsStreaming(false);
                    setToolActivity(null);
                }
            }
        );
    }, [input, isStreaming, messages, selectedModel, enableWebSearch, enableNoteTools, saveChat]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    }, [handleSubmit]);

    const handleNewChat = useCallback(async () => {
        // Save current chat first if it has messages
        if (chatNoteId && messages.length > 0) {
            await saveChat(messages);
        }
        // Create a new chat
        await initializeChat();
    }, [chatNoteId, messages, saveChat]);

    const handleSaveChat = useCallback(async () => {
        if (!chatNoteId) return;
        try {
            await server.post("special-notes/save-llm-chat", { llmChatNoteId: chatNoteId });
            // After saving, create a new chat for continued use
            await initializeChat();
        } catch (err) {
            console.error("Failed to save chat to permanent location:", err);
        }
    }, [chatNoteId]);

    if (!visible) {
        return null;
    }

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
                        disabled={messages.length === 0}
                    />
                </>
            }
        >
            <div className="sidebar-chat-container">
                <div className="sidebar-chat-messages">
                    {messages.length === 0 && !isStreaming && (
                        <div className="sidebar-chat-empty">
                            {t("llm_chat.empty_state")}
                        </div>
                    )}
                    {messages.map(msg => (
                        <ChatMessage key={msg.id} message={msg} />
                    ))}
                    {toolActivity && !streamingThinking && (
                        <div className="llm-chat-tool-activity">
                            <span className="llm-chat-tool-spinner" />
                            {toolActivity}
                        </div>
                    )}
                    {isStreaming && streamingThinking && (
                        <ChatMessage
                            message={{
                                id: "streaming-thinking",
                                role: "assistant",
                                content: streamingThinking,
                                createdAt: new Date().toISOString(),
                                type: "thinking"
                            }}
                            isStreaming
                        />
                    )}
                    {isStreaming && streamingContent && (
                        <ChatMessage
                            message={{
                                id: "streaming",
                                role: "assistant",
                                content: streamingContent,
                                createdAt: new Date().toISOString(),
                                citations: pendingCitations.length > 0 ? pendingCitations : undefined
                            }}
                            isStreaming
                        />
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <div className="sidebar-chat-input-area">
                    <textarea
                        ref={textareaRef}
                        className="sidebar-chat-input"
                        value={input}
                        onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
                        placeholder={t("llm_chat.placeholder")}
                        disabled={isStreaming}
                        onKeyDown={handleKeyDown}
                        rows={2}
                    />
                    <div className="sidebar-chat-actions">
                        <div className="sidebar-chat-options">
                            <label className="sidebar-chat-toggle" title={t("llm_chat.web_search")}>
                                <input
                                    type="checkbox"
                                    checked={enableWebSearch}
                                    onChange={() => setEnableWebSearch(v => !v)}
                                    disabled={isStreaming}
                                />
                                <span className="bx bx-globe" />
                            </label>
                            <label className="sidebar-chat-toggle" title={t("llm_chat.note_tools")}>
                                <input
                                    type="checkbox"
                                    checked={enableNoteTools}
                                    onChange={() => setEnableNoteTools(v => !v)}
                                    disabled={isStreaming}
                                />
                                <span className="bx bx-note" />
                            </label>
                        </div>
                        <button
                            type="button"
                            className="sidebar-chat-send-btn"
                            disabled={isStreaming || !input.trim()}
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
