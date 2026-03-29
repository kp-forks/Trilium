import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { t } from "../../../services/i18n.js";
import { streamChatCompletion, type ChatMessage as ChatMessageData, type Citation } from "../../../services/llm_chat.js";
import { useEditorSpacedUpdate } from "../../react/hooks.js";
import { TypeWidgetProps } from "../type_widget.js";
import ChatMessage from "./ChatMessage.js";
import "./LlmChat.css";

type MessageType = "message" | "error";

interface StoredMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
    citations?: Citation[];
    /** Message type for special rendering. Defaults to "message" if omitted. */
    type?: MessageType;
}

interface LlmChatContent {
    version: 1;
    messages: StoredMessage[];
    enableWebSearch?: boolean;
    enableExtendedThinking?: boolean;
}

export default function LlmChat({ note, ntxId, noteContext }: TypeWidgetProps) {
    const [messages, setMessages] = useState<StoredMessage[]>([]);
    const [input, setInput] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState("");
    const [toolActivity, setToolActivity] = useState<string | null>(null);
    const [pendingCitations, setPendingCitations] = useState<Citation[]>([]);
    const [enableWebSearch, setEnableWebSearch] = useState(true);
    const [enableExtendedThinking, setEnableExtendedThinking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shouldSave, setShouldSave] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingContent, toolActivity, scrollToBottom]);

    // Use a ref to store the latest messages for getData
    const messagesRef = useRef(messages);
    messagesRef.current = messages;

    const enableWebSearchRef = useRef(enableWebSearch);
    enableWebSearchRef.current = enableWebSearch;

    const enableExtendedThinkingRef = useRef(enableExtendedThinking);
    enableExtendedThinkingRef.current = enableExtendedThinking;

    const spacedUpdate = useEditorSpacedUpdate({
        note,
        noteType: "llmChat",
        noteContext,
        getData: () => {
            // Use refs to get the latest values, avoiding stale closure issues
            const content: LlmChatContent = {
                version: 1,
                messages: messagesRef.current,
                enableWebSearch: enableWebSearchRef.current,
                enableExtendedThinking: enableExtendedThinkingRef.current
            };
            return { content: JSON.stringify(content) };
        },
        onContentChange: (content) => {
            if (!content) {
                setMessages([]);
                return;
            }
            try {
                const parsed: LlmChatContent = JSON.parse(content);
                setMessages(parsed.messages || []);
                if (typeof parsed.enableWebSearch === "boolean") {
                    setEnableWebSearch(parsed.enableWebSearch);
                }
                if (typeof parsed.enableExtendedThinking === "boolean") {
                    setEnableExtendedThinking(parsed.enableExtendedThinking);
                }
            } catch (e) {
                console.error("Failed to parse LLM chat content:", e);
                setMessages([]);
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

    const handleSubmit = useCallback(async (e: Event) => {
        e.preventDefault();
        if (!input.trim() || isStreaming) return;

        setError(null);
        setToolActivity(null);
        setPendingCitations([]);

        const userMessage: StoredMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: input.trim(),
            createdAt: new Date().toISOString()
        };

        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput("");
        setIsStreaming(true);
        setStreamingContent("");

        let assistantContent = "";
        const citations: Citation[] = [];

        const apiMessages: ChatMessageData[] = newMessages.map(m => ({
            role: m.role,
            content: m.content
        }));

        await streamChatCompletion(
            apiMessages,
            { enableWebSearch, enableExtendedThinking },
            {
                onChunk: (text) => {
                    assistantContent += text;
                    setStreamingContent(assistantContent);
                    setToolActivity(null); // Clear tool activity when text starts
                },
                onToolUse: (toolName, _input) => {
                    const toolLabel = toolName === "web_search"
                        ? t("llm_chat.searching_web")
                        : `Using ${toolName}...`;
                    setToolActivity(toolLabel);
                },
                onCitation: (citation) => {
                    citations.push(citation);
                    setPendingCitations([...citations]);
                },
                onError: (errorMsg) => {
                    console.error("Chat error:", errorMsg);
                    // Persist error as an assistant message
                    const errorMessage: StoredMessage = {
                        id: crypto.randomUUID(),
                        role: "assistant",
                        content: errorMsg,
                        createdAt: new Date().toISOString(),
                        type: "error"
                    };
                    setMessages(prev => [...prev, errorMessage]);
                    setStreamingContent("");
                    setIsStreaming(false);
                    setToolActivity(null);
                    setShouldSave(true);
                },
                onDone: () => {
                    if (assistantContent) {
                        const assistantMessage: StoredMessage = {
                            id: crypto.randomUUID(),
                            role: "assistant",
                            content: assistantContent,
                            createdAt: new Date().toISOString(),
                            citations: citations.length > 0 ? citations : undefined
                        };
                        setMessages(prev => [...prev, assistantMessage]);
                    }
                    setStreamingContent("");
                    setPendingCitations([]);
                    setIsStreaming(false);
                    setToolActivity(null);
                    // Trigger save after state updates via useEffect
                    setShouldSave(true);
                }
            }
        );
    }, [input, isStreaming, messages, enableWebSearch, enableExtendedThinking]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    }, [handleSubmit]);

    const toggleWebSearch = useCallback(() => {
        setEnableWebSearch(prev => !prev);
        setShouldSave(true);
    }, []);

    const toggleExtendedThinking = useCallback(() => {
        setEnableExtendedThinking(prev => !prev);
        setShouldSave(true);
    }, []);

    return (
        <div className="llm-chat-container">
            <div className="llm-chat-messages">
                {messages.length === 0 && !isStreaming && (
                    <div className="llm-chat-empty">
                        {t("llm_chat.empty_state")}
                    </div>
                )}
                {messages.map(msg => (
                    <ChatMessage key={msg.id} message={msg} />
                ))}
                {toolActivity && (
                    <div className="llm-chat-tool-activity">
                        <span className="llm-chat-tool-spinner" />
                        {toolActivity}
                    </div>
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
                {error && (
                    <div className="llm-chat-error">
                        {error}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <form className="llm-chat-input-form" onSubmit={handleSubmit}>
                <div className="llm-chat-input-row">
                    <textarea
                        ref={textareaRef}
                        className="llm-chat-input"
                        value={input}
                        onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
                        placeholder={t("llm_chat.placeholder")}
                        disabled={isStreaming}
                        onKeyDown={handleKeyDown}
                        rows={3}
                    />
                    <button
                        type="submit"
                        className="llm-chat-send-btn"
                        disabled={isStreaming || !input.trim()}
                    >
                        {isStreaming ? t("llm_chat.sending") : t("llm_chat.send")}
                    </button>
                </div>
                <div className="llm-chat-options">
                    <label className="llm-chat-toggle">
                        <input
                            type="checkbox"
                            checked={enableWebSearch}
                            onChange={toggleWebSearch}
                            disabled={isStreaming}
                        />
                        <span className="bx bx-globe" />
                        {t("llm_chat.web_search")}
                    </label>
                    <label className="llm-chat-toggle">
                        <input
                            type="checkbox"
                            checked={enableExtendedThinking}
                            onChange={toggleExtendedThinking}
                            disabled={isStreaming}
                        />
                        <span className="bx bx-brain" />
                        {t("llm_chat.extended_thinking")}
                    </label>
                </div>
            </form>
        </div>
    );
}
