/**
 * Server-specific LLM Provider types.
 * Shared types (LlmMessage, LlmCitation, LlmStreamChunk, LlmChatConfig)
 * should be imported from @triliumnext/commons.
 */

import type { LlmChatConfig, LlmMessage } from "@triliumnext/commons";
import type { streamText } from "ai";

/**
 * Extended provider config with server-specific options.
 */
export interface LlmProviderConfig extends LlmChatConfig {
    maxTokens?: number;
    temperature?: number;
}

/**
 * Result type from streamText - the AI SDK's unified streaming interface.
 */
export type StreamResult = ReturnType<typeof streamText>;

export interface LlmProvider {
    name: string;

    /**
     * Create a streaming chat completion.
     * Returns the AI SDK StreamResult which is provider-agnostic.
     */
    chat(
        messages: LlmMessage[],
        config: LlmProviderConfig
    ): StreamResult;
}
