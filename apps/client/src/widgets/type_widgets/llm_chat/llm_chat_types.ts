import type { LlmCitation, LlmUsage } from "@triliumnext/commons";

export type MessageType = "message" | "error" | "thinking";

export interface ToolCall {
    id: string;
    toolName: string;
    input: Record<string, unknown>;
    /**
     * Raw JSON arguments accumulated from `tool_input_delta` chunks while the call's input
     * is still streaming. Cleared once the parsed `input` arrives via the `tool_use` chunk.
     */
    inputStreaming?: string;
    result?: string;
    isError?: boolean;
}

/** A block of text content (rendered as Markdown for assistant messages). */
export interface TextBlock {
    type: "text";
    content: string;
}

/** A tool invocation block shown inline in the message timeline. */
export interface ToolCallBlock {
    type: "tool_call";
    toolCall: ToolCall;
}

/**
 * An image attached to a user message, stored as a reference to a Trilium
 * attachment (uploaded to the chat note). The server resolves the bytes from
 * Becca before forwarding to the LLM provider.
 */
export interface ImageBlock {
    type: "image";
    attachmentId: string;
    mime: string;
    title: string;
    /** URL for inline display in the UI (e.g. `api/attachments/<id>/image/<title>`). */
    url: string;
}

/** An ordered content block in a chat message. */
export type ContentBlock = TextBlock | ToolCallBlock | ImageBlock;

/**
 * Extract the plain text from message content (works for both legacy string and block formats).
 */
export function getMessageText(content: string | ContentBlock[]): string {
    if (typeof content === "string") {
        return content;
    }
    return content
        .filter((b): b is TextBlock => b.type === "text")
        .map(b => b.content)
        .join("");
}

/**
 * Extract tool calls from message content blocks.
 */
export function getMessageToolCalls(message: StoredMessage): ToolCall[] {
    if (Array.isArray(message.content)) {
        return message.content
            .filter((b): b is ToolCallBlock => b.type === "tool_call")
            .map(b => b.toolCall);
    }
    return [];
}

export interface StoredMessage {
    id: string;
    role: "user" | "assistant" | "system";
    /** Message content: plain string (user messages, legacy) or ordered content blocks (assistant). */
    content: string | ContentBlock[];
    createdAt: string;
    citations?: LlmCitation[];
    /** Message type for special rendering. Defaults to "message" if omitted. */
    type?: MessageType;
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
