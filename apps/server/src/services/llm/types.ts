/**
 * Server-specific LLM Provider types.
 * Shared types (LlmMessage, LlmCitation, LlmStreamChunk, LlmChatConfig)
 * should be imported from @triliumnext/commons.
 */

import type { LlmChatConfig, LlmMessage, LlmStreamChunk } from "@triliumnext/commons";

/**
 * Extended provider config with server-specific options.
 */
export interface LlmProviderConfig extends LlmChatConfig {
    maxTokens?: number;
    temperature?: number;
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
