/**
 * LLM Provider types for chat integration.
 * Provider-agnostic interfaces to support multiple LLM backends.
 */

export interface LlmMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

/**
 * Citation information extracted from LLM responses.
 * May include URL (for web search) or document metadata (for document citations).
 */
export interface LlmCitation {
    /** Source URL (typically from web search) */
    url?: string;
    /** Document or page title */
    title?: string;
    /** The text that was cited */
    citedText?: string;
}

/**
 * Stream chunk types for real-time updates.
 */
export type LlmStreamChunk =
    | { type: "text"; content: string }
    | { type: "thinking"; content: string }
    | { type: "tool_use"; toolName: string; toolInput: Record<string, unknown> }
    | { type: "tool_result"; toolName: string; result: string }
    | { type: "citation"; citation: LlmCitation }
    | { type: "error"; error: string }
    | { type: "done" };

export interface LlmProviderConfig {
    provider?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
    /** Enable web search tool */
    enableWebSearch?: boolean;
    /** Enable extended thinking for deeper reasoning */
    enableExtendedThinking?: boolean;
    /** Token budget for extended thinking (default: 10000) */
    thinkingBudget?: number;
}

export interface LlmProvider {
    name: string;

    /**
     * Stream a chat completion response.
     * Yields chunks as they arrive from the LLM.
     */
    streamCompletion(
        messages: LlmMessage[],
        config: LlmProviderConfig
    ): AsyncIterable<LlmStreamChunk>;
}
