/**
 * LLM Provider types for chat integration.
 * Provider-agnostic interfaces to support multiple LLM backends.
 */

export interface LlmMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

export interface LlmStreamChunk {
    type: "text" | "error" | "done";
    content?: string;
    error?: string;
}

export interface LlmProviderConfig {
    provider?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
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
