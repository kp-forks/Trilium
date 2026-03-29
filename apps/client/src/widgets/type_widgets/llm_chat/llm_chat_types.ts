import type { LlmCitation, LlmUsage } from "@triliumnext/commons";

export type MessageType = "message" | "error" | "thinking";

export interface ToolCall {
    id: string;
    toolName: string;
    input: Record<string, unknown>;
    result?: string;
}

export interface StoredMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
    citations?: LlmCitation[];
    /** Message type for special rendering. Defaults to "message" if omitted. */
    type?: MessageType;
    /** Tool calls made during this response */
    toolCalls?: ToolCall[];
    /** Token usage for this response */
    usage?: LlmUsage;
}

export interface LlmChatContent {
    version: 1;
    messages: StoredMessage[];
    selectedModel?: string;
    enableWebSearch?: boolean;
    enableNoteTools?: boolean;
    enableExtendedThinking?: boolean;
}
