import type { LlmCitation, LlmMessage, LlmModelInfo, LlmUsage } from "@triliumnext/commons";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { t } from "../../../services/i18n.js";
import { getAvailableModels, streamChatCompletion } from "../../../services/llm_chat.js";
import { randomString } from "../../../services/utils.js";
import type { LlmChatContent, StoredMessage, ToolCall } from "./llm_chat_types.js";

export interface ModelOption extends LlmModelInfo {
    costDescription?: string;
}

export interface LlmChatOptions {
    /** Default value for enableNoteTools */
    defaultEnableNoteTools?: boolean;
    /** Whether extended thinking is supported */
    supportsExtendedThinking?: boolean;
}

export interface UseLlmChatReturn {
    // State
    messages: StoredMessage[];
    input: string;
    isStreaming: boolean;
    streamingContent: string;
    streamingThinking: string;
    toolActivity: string | null;
    pendingCitations: LlmCitation[];
    availableModels: ModelOption[];
    selectedModel: string;
    enableWebSearch: boolean;
    enableNoteTools: boolean;
    enableExtendedThinking: boolean;
    lastPromptTokens: number;
    messagesEndRef: React.RefObject<HTMLDivElement>;
    textareaRef: React.RefObject<HTMLTextAreaElement>;

    // Setters
    setInput: (value: string) => void;
    setMessages: (messages: StoredMessage[]) => void;
    setSelectedModel: (model: string) => void;
    setEnableWebSearch: (value: boolean) => void;
    setEnableNoteTools: (value: boolean) => void;
    setEnableExtendedThinking: (value: boolean) => void;

    // Actions
    handleSubmit: (e: Event) => Promise<void>;
    handleKeyDown: (e: KeyboardEvent) => void;
    loadFromContent: (content: LlmChatContent) => void;
    getContent: () => LlmChatContent;
    clearMessages: () => void;
}

export function useLlmChat(
    onMessagesChange?: (messages: StoredMessage[]) => void,
    options: LlmChatOptions = {}
): UseLlmChatReturn {
    const { defaultEnableNoteTools = false, supportsExtendedThinking = false } = options;

    const [messages, setMessagesInternal] = useState<StoredMessage[]>([]);
    const [input, setInput] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState("");
    const [streamingThinking, setStreamingThinking] = useState("");
    const [toolActivity, setToolActivity] = useState<string | null>(null);
    const [pendingCitations, setPendingCitations] = useState<LlmCitation[]>([]);
    const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>("");
    const [enableWebSearch, setEnableWebSearch] = useState(true);
    const [enableNoteTools, setEnableNoteTools] = useState(defaultEnableNoteTools);
    const [enableExtendedThinking, setEnableExtendedThinking] = useState(false);
    const [lastPromptTokens, setLastPromptTokens] = useState<number>(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Refs to get fresh values in getContent (avoids stale closures)
    const messagesRef = useRef(messages);
    messagesRef.current = messages;
    const selectedModelRef = useRef(selectedModel);
    selectedModelRef.current = selectedModel;
    const enableWebSearchRef = useRef(enableWebSearch);
    enableWebSearchRef.current = enableWebSearch;
    const enableNoteToolsRef = useRef(enableNoteTools);
    enableNoteToolsRef.current = enableNoteTools;
    const enableExtendedThinkingRef = useRef(enableExtendedThinking);
    enableExtendedThinkingRef.current = enableExtendedThinking;

    // Wrapper to call onMessagesChange when messages update
    const setMessages = useCallback((newMessages: StoredMessage[]) => {
        setMessagesInternal(newMessages);
        onMessagesChange?.(newMessages);
    }, [onMessagesChange]);

    // Fetch available models on mount
    useEffect(() => {
        getAvailableModels().then(models => {
            const modelsWithDescription = models.map(m => ({
                ...m,
                costDescription: m.costMultiplier ? `${m.costMultiplier}x` : undefined
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

    // Scroll to bottom when content changes
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingContent, streamingThinking, toolActivity, scrollToBottom]);

    // Load state from content object
    const loadFromContent = useCallback((content: LlmChatContent) => {
        setMessagesInternal(content.messages || []);
        if (content.selectedModel) {
            setSelectedModel(content.selectedModel);
        }
        if (typeof content.enableWebSearch === "boolean") {
            setEnableWebSearch(content.enableWebSearch);
        }
        if (typeof content.enableNoteTools === "boolean") {
            setEnableNoteTools(content.enableNoteTools);
        }
        if (supportsExtendedThinking && typeof content.enableExtendedThinking === "boolean") {
            setEnableExtendedThinking(content.enableExtendedThinking);
        }
        // Restore last prompt tokens from the most recent message with usage
        const lastUsage = [...(content.messages || [])].reverse().find(m => m.usage)?.usage;
        if (lastUsage) {
            setLastPromptTokens(lastUsage.promptTokens);
        }
    }, [supportsExtendedThinking]);

    // Get current state as content object (uses refs to avoid stale closures)
    const getContent = useCallback((): LlmChatContent => {
        const content: LlmChatContent = {
            version: 1,
            messages: messagesRef.current,
            selectedModel: selectedModelRef.current || undefined,
            enableWebSearch: enableWebSearchRef.current,
            enableNoteTools: enableNoteToolsRef.current
        };
        if (supportsExtendedThinking) {
            content.enableExtendedThinking = enableExtendedThinkingRef.current;
        }
        return content;
    }, [supportsExtendedThinking]);

    const clearMessages = useCallback(() => {
        setMessages([]);
    }, [setMessages]);

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
        setMessagesInternal(newMessages);
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

        const streamOptions: Parameters<typeof streamChatCompletion>[1] = {
            model: selectedModel || undefined,
            enableWebSearch,
            enableNoteTools
        };
        if (supportsExtendedThinking) {
            streamOptions.enableExtendedThinking = enableExtendedThinking;
        }

        await streamChatCompletion(
            apiMessages,
            streamOptions,
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
                    setLastPromptTokens(u.promptTokens);
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
                    }

                    setStreamingContent("");
                    setStreamingThinking("");
                    setPendingCitations([]);
                    setIsStreaming(false);
                    setToolActivity(null);
                }
            }
        );
    }, [input, isStreaming, messages, selectedModel, enableWebSearch, enableNoteTools, enableExtendedThinking, supportsExtendedThinking, setMessages]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    }, [handleSubmit]);

    return {
        // State
        messages,
        input,
        isStreaming,
        streamingContent,
        streamingThinking,
        toolActivity,
        pendingCitations,
        availableModels,
        selectedModel,
        enableWebSearch,
        enableNoteTools,
        enableExtendedThinking,
        lastPromptTokens,
        messagesEndRef,
        textareaRef,

        // Setters
        setInput,
        setMessages,
        setSelectedModel,
        setEnableWebSearch,
        setEnableNoteTools,
        setEnableExtendedThinking,

        // Actions
        handleSubmit,
        handleKeyDown,
        loadFromContent,
        getContent,
        clearMessages
    };
}
