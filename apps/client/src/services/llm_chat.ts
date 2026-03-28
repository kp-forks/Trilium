import server from "./server.js";

export interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

export interface ChatConfig {
    provider?: string;
    model?: string;
    systemPrompt?: string;
    enableWebSearch?: boolean;
}

export interface Citation {
    url: string;
    title?: string;
}

export interface StreamCallbacks {
    onChunk: (text: string) => void;
    onToolUse?: (toolName: string, input: Record<string, unknown>) => void;
    onToolResult?: (toolName: string, result: string) => void;
    onCitation?: (citation: Citation) => void;
    onError: (error: string) => void;
    onDone: () => void;
}

/**
 * Stream a chat completion from the LLM API using Server-Sent Events.
 */
export async function streamChatCompletion(
    messages: ChatMessage[],
    config: ChatConfig,
    callbacks: StreamCallbacks
): Promise<void> {
    const headers = await server.getHeaders();

    const response = await fetch(`${window.glob.baseApiUrl}llm-chat/stream`, {
        method: "POST",
        headers: {
            ...headers,
            "Content-Type": "application/json"
        } as HeadersInit,
        body: JSON.stringify({ messages, config })
    });

    if (!response.ok) {
        callbacks.onError(`HTTP ${response.status}: ${response.statusText}`);
        return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
        callbacks.onError("No response body");
        return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        switch (data.type) {
                            case "text":
                                callbacks.onChunk(data.content);
                                break;
                            case "tool_use":
                                callbacks.onToolUse?.(data.toolName, data.toolInput);
                                break;
                            case "tool_result":
                                callbacks.onToolResult?.(data.toolName, data.result);
                                break;
                            case "citation":
                                callbacks.onCitation?.({ url: data.url, title: data.title });
                                break;
                            case "error":
                                callbacks.onError(data.error);
                                break;
                            case "done":
                                callbacks.onDone();
                                break;
                        }
                    } catch (e) {
                        // Ignore JSON parse errors for partial data
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}
