/**
 * Shared LLM types for chat integration.
 * Used by both client and server for API communication.
 */

/**
 * A chat message in the conversation.
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
 * Configuration for LLM chat requests.
 */
export interface LlmChatConfig {
    provider?: string;
    model?: string;
    systemPrompt?: string;
    /** Enable web search tool */
    enableWebSearch?: boolean;
    /** Enable note tools (search and read notes) */
    enableNoteTools?: boolean;
    /** Enable extended thinking for deeper reasoning */
    enableExtendedThinking?: boolean;
    /** Token budget for extended thinking (default: 10000) */
    thinkingBudget?: number;
}

/**
 * Token usage information from the LLM response.
 */
export interface LlmUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    /** Estimated cost in USD (if available) */
    cost?: number;
}

/**
 * Stream chunk types for real-time SSE updates.
 * Defines the protocol between server and client.
 */
export type LlmStreamChunk =
    | { type: "text"; content: string }
    | { type: "thinking"; content: string }
    | { type: "tool_use"; toolName: string; toolInput: Record<string, unknown> }
    | { type: "tool_result"; toolName: string; result: string }
    | { type: "citation"; citation: LlmCitation }
    | { type: "usage"; usage: LlmUsage }
    | { type: "error"; error: string }
    | { type: "done" };
