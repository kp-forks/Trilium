/**
 * LLM Provider types for chat integration.
 * Provider-agnostic interfaces to support multiple LLM backends.
 */

export interface LlmMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

/**
 * Stream chunk types for real-time updates.
 */
export type LlmStreamChunk =
    | { type: "text"; content: string }
    | { type: "tool_use"; toolName: string; toolInput: Record<string, unknown> }
    | { type: "tool_result"; toolName: string; result: string }
    | { type: "citation"; url: string; title?: string }
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
