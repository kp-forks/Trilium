import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { t } from "../../../services/i18n.js";
import { streamChatCompletion, type ChatMessage as ChatMessageData } from "../../../services/llm_chat.js";
import { useEditorSpacedUpdate } from "../../react/hooks.js";
import { TypeWidgetProps } from "../type_widget.js";
import ChatMessage from "./ChatMessage.js";
import "./LlmChat.css";

interface StoredMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
}

interface LlmChatContent {
    version: 1;
    messages: StoredMessage[];
}

const EMPTY_CONTENT: LlmChatContent = { version: 1, messages: [] };

export default function LlmChat({ note, ntxId, noteContext }: TypeWidgetProps) {
    const [messages, setMessages] = useState<StoredMessage[]>([]);
    const [input, setInput] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState("");
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingContent, scrollToBottom]);

    const spacedUpdate = useEditorSpacedUpdate({
        note,
        noteType: "llmChat",
        noteContext,
        getData: () => {
            const content: LlmChatContent = { version: 1, messages };
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
            } catch (e) {
                console.error("Failed to parse LLM chat content:", e);
                setMessages([]);
            }
        }
    });

    const handleSubmit = useCallback(async (e: Event) => {
        e.preventDefault();
        if (!input.trim() || isStreaming) return;

        setError(null);

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

        const apiMessages: ChatMessageData[] = newMessages.map(m => ({
            role: m.role,
            content: m.content
        }));

        await streamChatCompletion(
            apiMessages,
            {},
            {
                onChunk: (text) => {
                    assistantContent += text;
                    setStreamingContent(assistantContent);
                },
                onError: (errorMsg) => {
                    console.error("Chat error:", errorMsg);
                    setError(errorMsg);
                    setIsStreaming(false);
                },
                onDone: () => {
                    if (assistantContent) {
                        const assistantMessage: StoredMessage = {
                            id: crypto.randomUUID(),
                            role: "assistant",
                            content: assistantContent,
                            createdAt: new Date().toISOString()
                        };
                        setMessages(prev => [...prev, assistantMessage]);
                    }
                    setStreamingContent("");
                    setIsStreaming(false);
                    spacedUpdate.scheduleUpdate();
                }
            }
        );
    }, [input, isStreaming, messages, spacedUpdate]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    }, [handleSubmit]);

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
                {isStreaming && streamingContent && (
                    <ChatMessage
                        message={{
                            id: "streaming",
                            role: "assistant",
                            content: streamingContent,
                            createdAt: new Date().toISOString()
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
            </form>
        </div>
    );
}
