import type { LlmCitation, LlmMessage, LlmMessagePart, LlmModelInfo, LlmUsage } from "@triliumnext/commons";
import { RefObject } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { getAvailableModels, streamChatCompletion } from "../../../services/llm_chat.js";
import { randomString } from "../../../services/utils.js";
import type { ContentBlock, ImageBlock, LlmChatContent, StoredMessage } from "./llm_chat_types.js";

/**
 * Flatten a stored message's content into the wire format the server expects.
 * Plain string content stays as-is; block-shaped content (with images) becomes
 * an ordered array of text/image parts, with tool-call blocks stripped.
 */
function flattenToApiContent(content: string | ContentBlock[]): string | LlmMessagePart[] {
    if (typeof content === "string") {
        return content;
    }
    const parts: LlmMessagePart[] = [];
    for (const block of content) {
        if (block.type === "text") {
            if (block.content) parts.push({ type: "text", text: block.content });
        } else if (block.type === "image") {
            parts.push({ type: "image", attachmentId: block.attachmentId, mime: block.mime });
        }
        // tool_call blocks belong to assistant history rendering only — they
        // are reconstructed from the model's own tool-use turns and must not
        // be re-sent as user/assistant content.
    }
    // Collapse to a string if there is no multimodal content — keeps backwards
    // compatibility with providers/paths that haven't been touched.
    if (parts.length === 0) return "";
    if (parts.length === 1 && parts[0].type === "text") return parts[0].text;
    return parts;
}

export interface ModelOption extends LlmModelInfo {
    costDescription?: string;
}

export interface LlmChatOptions {
    /** Default value for enableNoteTools */
    defaultEnableNoteTools?: boolean;
    /** Whether extended thinking is supported */
    supportsExtendedThinking?: boolean;
    /** Initial context note ID (the note the user is viewing) */
    contextNoteId?: string;
    /** The chat note ID (used for auto-renaming on first message) */
    chatNoteId?: string;
}

export interface UseLlmChatReturn {
    // State
    messages: StoredMessage[];
    input: string;
    isStreaming: boolean;
    streamingContent: string;
    streamingBlocks: ContentBlock[];
    streamingThinking: string;
    pendingCitations: LlmCitation[];
    /** Images the user has attached but not yet sent. */
    pendingAttachments: ImageBlock[];
    availableModels: ModelOption[];
    selectedModel: string;
    enableWebSearch: boolean;
    enableNoteTools: boolean;
    enableExtendedThinking: boolean;
    contextNoteId: string | undefined;
    /** The chat note's ID — used as the upload target for attachments. */
    chatNoteId: string | undefined;
    lastPromptTokens: number;
    messagesEndRef: RefObject<HTMLDivElement>;
    scrollContainerRef: RefObject<HTMLDivElement>;
    /** Whether a provider is configured and available */
    hasProvider: boolean;
    /** Whether we're still checking for providers */
    isCheckingProvider: boolean;

    // Setters
    setInput: (value: string) => void;
    setMessages: (messages: StoredMessage[]) => void;
    setSelectedModel: (model: string) => void;
    setEnableWebSearch: (value: boolean) => void;
    setEnableNoteTools: (value: boolean) => void;
    setEnableExtendedThinking: (value: boolean) => void;
    setContextNoteId: (noteId: string | undefined) => void;
    setChatNoteId: (noteId: string | undefined) => void;
    /** Append a freshly uploaded image to the pending-attachments list. */
    addPendingAttachment: (attachment: ImageBlock) => void;
    /** Remove a pending attachment by its attachment ID. */
    removePendingAttachment: (attachmentId: string) => void;

    // Actions
    handleSubmit: (e: Event) => Promise<void>;
    handleKeyDown: (e: KeyboardEvent) => void;
    loadFromContent: (content: LlmChatContent) => void;
    getContent: () => LlmChatContent;
    clearMessages: () => void;
    /** Refresh the provider/models list */
    refreshModels: () => void;
    /** Stop the current generation */
    stopStreaming: () => void;
    /** Re-run the last turn after a failed response (drops the trailing error message) */
    retryLast: () => void;
}

export function useLlmChat(
    onMessagesChange?: (messages: StoredMessage[]) => void,
    options: LlmChatOptions = {}
): UseLlmChatReturn {
    const { defaultEnableNoteTools = false, supportsExtendedThinking = false, contextNoteId: initialContextNoteId, chatNoteId: initialChatNoteId } = options;

    const [messages, setMessagesInternal] = useState<StoredMessage[]>([]);
    const [input, setInput] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState("");
    const [streamingBlocks, setStreamingBlocks] = useState<ContentBlock[]>([]);
    const [streamingThinking, setStreamingThinking] = useState("");
    const [pendingCitations, setPendingCitations] = useState<LlmCitation[]>([]);
    const [pendingAttachments, setPendingAttachments] = useState<ImageBlock[]>([]);
    const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>("");
    const [enableWebSearch, setEnableWebSearch] = useState(true);
    const [enableNoteTools, setEnableNoteTools] = useState(defaultEnableNoteTools);
    const [enableExtendedThinking, setEnableExtendedThinking] = useState(false);
    const [contextNoteId, setContextNoteId] = useState<string | undefined>(initialContextNoteId);
    const [chatNoteId, setChatNoteIdState] = useState<string | undefined>(initialChatNoteId);
    const [lastPromptTokens, setLastPromptTokens] = useState<number>(0);
    const [hasProvider, setHasProvider] = useState<boolean>(true); // Assume true initially
    const [isCheckingProvider, setIsCheckingProvider] = useState<boolean>(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const isNearBottomRef = useRef(true);

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
    const chatNoteIdRef = useRef(chatNoteId);
    chatNoteIdRef.current = chatNoteId;
    const setChatNoteId = useCallback((noteId: string | undefined) => {
        chatNoteIdRef.current = noteId;
        setChatNoteIdState(noteId);
    }, []);
    const contextNoteIdRef = useRef(contextNoteId);
    contextNoteIdRef.current = contextNoteId;
    const pendingAttachmentsRef = useRef(pendingAttachments);
    pendingAttachmentsRef.current = pendingAttachments;

    const addPendingAttachment = useCallback((attachment: ImageBlock) => {
        setPendingAttachments(prev => [...prev, attachment]);
    }, []);
    const removePendingAttachment = useCallback((attachmentId: string) => {
        setPendingAttachments(prev => prev.filter(a => a.attachmentId !== attachmentId));
    }, []);

    // Wrapper to call onMessagesChange when messages update
    const setMessages = useCallback((newMessages: StoredMessage[]) => {
        setMessagesInternal(newMessages);
        onMessagesChange?.(newMessages);
    }, [onMessagesChange]);

    // Fetch available models on mount
    const refreshModels = useCallback(() => {
        setIsCheckingProvider(true);
        getAvailableModels().then(models => {
            const modelsWithDescription = models.map(m => ({
                ...m,
                costDescription: m.costMultiplier ? `${m.costMultiplier}x` : undefined
            }));
            setAvailableModels(modelsWithDescription);
            setHasProvider(models.length > 0);
            setIsCheckingProvider(false);
            if (!selectedModel) {
                const defaultModel = models.find(m => m.isDefault) || models[0];
                if (defaultModel) {
                    setSelectedModel(defaultModel.id);
                }
            }
        }).catch(err => {
            console.error("Failed to fetch available models:", err);
            setHasProvider(false);
            setIsCheckingProvider(false);
        });
    }, [selectedModel]);

    useEffect(() => {
        refreshModels();
    }, []);

    // Track whether the user is near the bottom of the scroll container
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const THRESHOLD = 50; // px from bottom
        const handleScroll = () => {
            isNearBottomRef.current =
                container.scrollHeight - container.scrollTop - container.clientHeight <= THRESHOLD;
        };

        container.addEventListener("scroll", handleScroll, { passive: true });
        return () => container.removeEventListener("scroll", handleScroll);
    }, []);

    // Scroll to bottom when content changes, but only if user hasn't scrolled away.
    // Always use instant scroll — smooth animations race with the scroll listener
    // during streaming, causing the auto-scroll to "unstick" mid-animation.
    const scrollToBottom = useCallback(() => {
        if (isNearBottomRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
        }
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingContent, streamingThinking, scrollToBottom]);

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
        setLastPromptTokens(lastUsage?.promptTokens ?? 0);
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
        setLastPromptTokens(0);
    }, [setMessages]);

    /**
     * Run a streaming completion against `conversation` — the full ordered message
     * list to send to the model and to use as the base for finalized/error results.
     */
    const runStream = useCallback(async (conversation: StoredMessage[]) => {
        setPendingCitations([]);
        setMessagesInternal(conversation);
        setIsStreaming(true);
        setStreamingContent("");
        setStreamingBlocks([]);
        setStreamingThinking("");

        let thinkingContent = "";
        const contentBlocks: ContentBlock[] = [];
        const citations: LlmCitation[] = [];
        let usage: LlmUsage | undefined;

        /** Get or create the last text block to append streaming text to. */
        function lastTextBlock(): ContentBlock & { type: "text" } {
            const last = contentBlocks[contentBlocks.length - 1];
            if (last?.type === "text") {
                return last;
            }
            const block: ContentBlock = { type: "text", content: "" };
            contentBlocks.push(block);
            return block as ContentBlock & { type: "text" };
        }

        const apiMessages: LlmMessage[] = conversation.map(m => ({
            role: m.role,
            content: flattenToApiContent(m.content)
        }));

        const selectedModelProvider = availableModels.find(m => m.id === selectedModel)?.provider;
        const streamOptions: Parameters<typeof streamChatCompletion>[1] = {
            model: selectedModel || undefined,
            provider: selectedModelProvider,
            enableWebSearch,
            enableNoteTools,
            contextNoteId,
            chatNoteId: chatNoteIdRef.current
        };
        if (supportsExtendedThinking) {
            streamOptions.enableExtendedThinking = enableExtendedThinking;
        }

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        /** Shared cleanup: finalize collected content and reset streaming state. */
        function finalizeStream() {
            // Mark any in-progress tool calls as stopped so they don't show infinite spinners.
            // Also clear `inputStreaming` so a half-streamed JSON arg list doesn't render.
            for (const [i, block] of contentBlocks.entries()) {
                if (block.type === "tool_call" && !block.toolCall.result) {
                    contentBlocks[i] = {
                        type: "tool_call",
                        toolCall: {
                            ...block.toolCall,
                            inputStreaming: undefined,
                            result: "[Stopped]",
                            isError: true
                        }
                    };
                }
            }

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

            if (contentBlocks.length > 0) {
                finalNewMessages.push({
                    id: randomString(),
                    role: "assistant",
                    content: contentBlocks,
                    createdAt: new Date().toISOString(),
                    citations: citations.length > 0 ? citations : undefined,
                    usage
                });
            }

            if (finalNewMessages.length > 0) {
                setMessages([...conversation, ...finalNewMessages]);
            }

            setStreamingContent("");
            setStreamingBlocks([]);
            setStreamingThinking("");
            setPendingCitations([]);
            setIsStreaming(false);
            abortControllerRef.current = null;
        }

        await streamChatCompletion(
            apiMessages,
            streamOptions,
            {
                onChunk: (text) => {
                    lastTextBlock().content += text;
                    setStreamingContent(contentBlocks
                        .filter((b): b is ContentBlock & { type: "text" } => b.type === "text")
                        .map(b => b.content)
                        .join(""));
                    setStreamingBlocks([...contentBlocks]);
                },
                onThinking: (text) => {
                    thinkingContent += text;
                    setStreamingThinking(thinkingContent);
                },
                onToolInputStart: (toolCallId, toolName) => {
                    contentBlocks.push({
                        type: "tool_call",
                        toolCall: {
                            id: toolCallId,
                            toolName,
                            input: {},
                            inputStreaming: ""
                        }
                    });
                    setStreamingBlocks([...contentBlocks]);
                },
                onToolInputDelta: (toolCallId, delta) => {
                    for (let i = contentBlocks.length - 1; i >= 0; i--) {
                        const block = contentBlocks[i];
                        if (block.type === "tool_call" && block.toolCall.id === toolCallId) {
                            contentBlocks[i] = {
                                type: "tool_call",
                                toolCall: {
                                    ...block.toolCall,
                                    inputStreaming: (block.toolCall.inputStreaming ?? "") + delta
                                }
                            };
                            break;
                        }
                    }
                    setStreamingBlocks([...contentBlocks]);
                },
                onToolUse: (toolCallId, toolName, toolInput) => {
                    // Some providers skip tool-input-start/delta entirely and only emit
                    // the final tool-call. In that case there's no pending block to update,
                    // so push a fresh one.
                    for (let i = contentBlocks.length - 1; i >= 0; i--) {
                        const block = contentBlocks[i];
                        if (block.type === "tool_call" && block.toolCall.id === toolCallId) {
                            contentBlocks[i] = {
                                type: "tool_call",
                                toolCall: {
                                    ...block.toolCall,
                                    input: toolInput,
                                    inputStreaming: undefined
                                }
                            };
                            setStreamingBlocks([...contentBlocks]);
                            return;
                        }
                    }
                    contentBlocks.push({
                        type: "tool_call",
                        toolCall: { id: toolCallId, toolName, input: toolInput }
                    });
                    setStreamingBlocks([...contentBlocks]);
                },
                onToolResult: (toolCallId, _toolName, result, isError) => {
                    // Replace the matching block with a new object so Preact sees the change.
                    for (let i = contentBlocks.length - 1; i >= 0; i--) {
                        const block = contentBlocks[i];
                        if (block.type === "tool_call" && block.toolCall.id === toolCallId) {
                            contentBlocks[i] = {
                                type: "tool_call",
                                toolCall: { ...block.toolCall, result, isError }
                            };
                            break;
                        }
                    }
                    setStreamingBlocks([...contentBlocks]);
                },
                onCitation: (citation) => {
                    // Deduplicate by URL
                    if (!citation.url || !citations.some(c => c.url === citation.url)) {
                        citations.push(citation);
                        setPendingCitations([...citations]);
                    }
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
                    const finalMessages = [...conversation, errorMessage];
                    setMessages(finalMessages);
                    setStreamingContent("");
                    setStreamingBlocks([]);
                    setStreamingThinking("");
                    setIsStreaming(false);
                },
                onDone: () => {
                    finalizeStream();
                }
            },
            abortController.signal
        ).catch((e) => {
            // AbortError is expected when user stops generation
            if (e instanceof DOMException && e.name === "AbortError") {
                finalizeStream();
                return;
            }
            // Unexpected error — streamChatCompletion normally routes failures
            // through onError, so reaching here is a bug. Surface it in the chat
            // and reset state instead of leaving the UI stuck on the stop button.
            console.error("Unexpected error in chat stream:", e);
            const errorMsg = e instanceof Error ? e.message : String(e);
            setMessages([...conversation, {
                id: randomString(),
                role: "assistant",
                content: errorMsg,
                createdAt: new Date().toISOString(),
                type: "error"
            }]);
            setStreamingContent("");
            setStreamingBlocks([]);
            setStreamingThinking("");
            setIsStreaming(false);
            abortControllerRef.current = null;
        });
    }, [selectedModel, availableModels, enableWebSearch, enableNoteTools, enableExtendedThinking, contextNoteId, supportsExtendedThinking, setMessages]);

    const handleSubmit = useCallback(async (e: Event) => {
        e.preventDefault();
        if (isStreaming) return;
        const trimmedInput = input.trim();
        const attachments = pendingAttachmentsRef.current;
        if (!trimmedInput && attachments.length === 0) return;

        // If there are attachments, build a block-shaped content array so the
        // images travel alongside the text. Otherwise stay with the simple
        // string form so existing chat history remains byte-identical.
        let content: StoredMessage["content"];
        if (attachments.length === 0) {
            content = trimmedInput;
        } else {
            const blocks: ContentBlock[] = [];
            if (trimmedInput) {
                blocks.push({ type: "text", content: trimmedInput });
            }
            for (const att of attachments) {
                blocks.push(att);
            }
            content = blocks;
        }

        const userMessage: StoredMessage = {
            id: randomString(),
            role: "user",
            content,
            createdAt: new Date().toISOString()
        };
        setInput("");
        setPendingAttachments([]);
        await runStream([...messages, userMessage]);
    }, [input, isStreaming, messages, runStream]);

    /** Re-run the last turn after a failed response, dropping the trailing error message. */
    const retryLast = useCallback(async () => {
        if (isStreaming) return;
        if (messages[messages.length - 1]?.type !== "error") return;
        await runStream(messages.slice(0, -1));
    }, [isStreaming, messages, runStream]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    }, [handleSubmit]);

    /** Stop the current generation by aborting the SSE connection. */
    const stopStreaming = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    return {
        // State
        messages,
        input,
        isStreaming,
        streamingContent,
        streamingBlocks,
        streamingThinking,
        pendingCitations,
        pendingAttachments,
        availableModels,
        selectedModel,
        enableWebSearch,
        enableNoteTools,
        enableExtendedThinking,
        contextNoteId,
        chatNoteId,
        lastPromptTokens,
        messagesEndRef,
        scrollContainerRef,
        hasProvider,
        isCheckingProvider,

        // Setters
        setInput,
        setMessages,
        setSelectedModel,
        setEnableWebSearch,
        setEnableNoteTools,
        setEnableExtendedThinking,
        setContextNoteId,
        setChatNoteId,
        addPendingAttachment,
        removePendingAttachment,

        // Actions
        handleSubmit,
        handleKeyDown,
        loadFromContent,
        getContent,
        clearMessages,
        refreshModels,
        stopStreaming,
        retryLast
    };
}
