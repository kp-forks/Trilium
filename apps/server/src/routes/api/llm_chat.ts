import type { Request, Response } from "express";
import type { LlmMessage } from "@triliumnext/commons";

import { getProviderByType, hasConfiguredProviders, type LlmProviderConfig } from "../../services/llm/index.js";
import { streamToChunks } from "../../services/llm/stream.js";
import { generateChatTitle } from "../../services/llm/chat_title.js";

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
        if (!hasConfiguredProviders()) {
            res.write(`data: ${JSON.stringify({ type: "error", error: "No LLM providers configured. Please add a provider in Options → AI / LLM." })}\n\n`);
            res.end();
            return;
        }

        const provider = getProviderByType(config.provider || "anthropic");
        const result = provider.chat(messages, config);

        // Get pricing and display name for the model
        const modelId = config.model || "claude-sonnet-4-6";
        const pricing = provider.getModelPricing(modelId);
        const modelDisplayName = provider.getAvailableModels().find(m => m.id === modelId)?.name || modelId;
        for await (const chunk of streamToChunks(result, { model: modelDisplayName, pricing })) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            // Flush immediately to ensure real-time streaming
            if (typeof flushableRes.flush === "function") {
                flushableRes.flush();
            }
        }
        // Auto-generate a title for the chat note on the first user message
        const userMessages = messages.filter(m => m.role === "user");
        if (userMessages.length === 1 && config.chatNoteId) {
            try {
                await generateChatTitle(config.chatNoteId, userMessages[0].content);
            } catch (err) {
                // Title generation is best-effort; don't fail the chat
                console.error("Failed to generate chat title:", err);
            }
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        res.write(`data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`);
    } finally {
        res.end();
    }
}

/**
 * Get available models for a provider.
 */
function getModels(req: Request, _res: Response) {
    const providerType = req.query.provider as string || "anthropic";

    // Return empty array when no providers configured - client handles this gracefully
    if (!hasConfiguredProviders()) {
        return { models: [] };
    }

    const llmProvider = getProviderByType(providerType);
    const models = llmProvider.getAvailableModels();
    return { models };
}

export default {
    streamChat,
    getModels
};
