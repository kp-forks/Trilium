import type { Request, Response } from "express";
import type { LlmMessage } from "@triliumnext/commons";

import { getProvider, type LlmProviderConfig } from "../../services/llm/index.js";
import { streamToChunks } from "../../services/llm/stream.js";

interface ChatRequest {
    messages: LlmMessage[];
    config?: LlmProviderConfig;
}

/**
 * SSE endpoint for streaming chat completions.
 *
 * Response format (Server-Sent Events):
 * data: {"type":"text","content":"Hello"}
 * data: {"type":"text","content":" world"}
 * data: {"type":"done"}
 *
 * On error:
 * data: {"type":"error","error":"Error message"}
 */
async function streamChat(req: Request, res: Response) {
    const { messages, config = {} } = req.body as ChatRequest;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: "messages array is required" });
        return;
    }

    // Set up SSE headers - disable compression and buffering for real-time streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    res.setHeader("Content-Encoding", "none"); // Disable compression
    res.flushHeaders();

    // Mark response as handled to prevent double-handling by apiResultHandler
    res.triliumResponseHandled = true;

    // Type assertion for flush method (available when compression is used)
    const flushableRes = res as Response & { flush?: () => void };

    try {
        const provider = getProvider(config.provider || "anthropic");
        const result = provider.chat(messages, config);

        for await (const chunk of streamToChunks(result)) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            // Flush immediately to ensure real-time streaming
            if (typeof flushableRes.flush === "function") {
                flushableRes.flush();
            }
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        res.write(`data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`);
    } finally {
        res.end();
    }
}

export default {
    streamChat
};
