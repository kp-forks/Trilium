import "./LlmChat.css";

import { marked } from "marked";
import { useMemo } from "preact/hooks";

import { t } from "../../../services/i18n.js";
import utils from "../../../services/utils.js";
import { type ContentBlock, getMessageText, type StoredMessage, type ToolCall } from "./llm_chat_types.js";

function shortenNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
    return n.toString();
}

// Configure marked for safe rendering
marked.setOptions({
    breaks: true, // Convert \n to <br>
    gfm: true // GitHub Flavored Markdown
});

interface Props {
    message: StoredMessage;
    isStreaming?: boolean;
}

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
    const classes = [
        "llm-chat-tool-call-inline",
        toolCall.isError && "llm-chat-tool-call-error"
    ].filter(Boolean).join(" ");

    return (
        <details className={classes}>
            <summary className="llm-chat-tool-call-inline-summary">
                <span className={toolCall.isError ? "bx bx-error-circle" : "bx bx-wrench"} />
                {toolCall.toolName}
                {toolCall.isError && <span className="llm-chat-tool-call-error-badge">{t("llm_chat.tool_error")}</span>}
            </summary>
            <div className="llm-chat-tool-call-inline-body">
                <div className="llm-chat-tool-call-input">
                    <strong>{t("llm_chat.input")}:</strong>
                    <pre>{JSON.stringify(toolCall.input, null, 2)}</pre>
                </div>
                {toolCall.result && (
                    <div className={`llm-chat-tool-call-result ${toolCall.isError ? "llm-chat-tool-call-result-error" : ""}`}>
                        <strong>{toolCall.isError ? t("llm_chat.error") : t("llm_chat.result")}:</strong>
                        <pre>{(() => {
                            if (typeof toolCall.result === "string" && (toolCall.result.startsWith("{") || toolCall.result.startsWith("["))) {
                                try {
                                    return JSON.stringify(JSON.parse(toolCall.result), null, 2);
                                } catch {
                                    return toolCall.result;
                                }
                            }
                            return toolCall.result;
                        })()}</pre>
                    </div>
                )}
            </div>
        </details>
    );
}

function renderContentBlocks(blocks: ContentBlock[], isStreaming?: boolean) {
    return blocks.map((block, idx) => {
        if (block.type === "text") {
            const html = marked.parse(block.content) as string;
            return (
                <div key={idx}>
                    <div
                        className="llm-chat-markdown"
                        dangerouslySetInnerHTML={{ __html: html }}
                    />
                    {isStreaming && idx === blocks.length - 1 && <span className="llm-chat-cursor" />}
                </div>
            );
        }
        if (block.type === "tool_call") {
            return <ToolCallCard key={idx} toolCall={block.toolCall} />;
        }
        return null;
    });
}

export default function ChatMessage({ message, isStreaming }: Props) {
    const roleLabel = message.role === "user" ? "You" : "Assistant";
    const isError = message.type === "error";
    const isThinking = message.type === "thinking";
    const textContent = typeof message.content === "string" ? message.content : getMessageText(message.content);

    // Render markdown for assistant messages with legacy string content
    const renderedContent = useMemo(() => {
        if (message.role === "assistant" && !isError && !isThinking && typeof message.content === "string") {
            return marked.parse(message.content) as string;
        }
        return null;
    }, [message.content, message.role, isError, isThinking]);

    const messageClasses = [
        "llm-chat-message",
        `llm-chat-message-${message.role}`,
        isError && "llm-chat-message-error",
        isThinking && "llm-chat-message-thinking"
    ].filter(Boolean).join(" ");

    // Render thinking messages in a collapsible details element
    if (isThinking) {
        return (
            <details className={messageClasses}>
                <summary className="llm-chat-thinking-summary">
                    <span className="bx bx-brain" />
                    {t("llm_chat.thought_process")}
                </summary>
                <div className="llm-chat-message-content llm-chat-thinking-content">
                    {textContent}
                    {isStreaming && <span className="llm-chat-cursor" />}
                </div>
            </details>
        );
    }

    // Legacy tool calls (from old format stored as separate field)
    const legacyToolCalls = message.toolCalls;
    const hasBlockContent = Array.isArray(message.content);

    return (
        <div className={`llm-chat-message-wrapper llm-chat-message-wrapper-${message.role}`}>
            <div className={messageClasses}>
                <div className="llm-chat-message-role">
                    {isError ? "Error" : roleLabel}
                </div>
                <div className="llm-chat-message-content">
                    {message.role === "assistant" && !isError ? (
                        hasBlockContent ? (
                            renderContentBlocks(message.content as ContentBlock[], isStreaming)
                        ) : (
                            <>
                                <div
                                    className="llm-chat-markdown"
                                    dangerouslySetInnerHTML={{ __html: renderedContent || "" }}
                                />
                                {isStreaming && <span className="llm-chat-cursor" />}
                            </>
                        )
                    ) : (
                        textContent
                    )}
                </div>
                {legacyToolCalls && legacyToolCalls.length > 0 && (
                    <details className="llm-chat-tool-calls">
                        <summary className="llm-chat-tool-calls-summary">
                            <span className="bx bx-wrench" />
                            {t("llm_chat.tool_calls", { count: legacyToolCalls.length })}
                        </summary>
                        <div className="llm-chat-tool-calls-list">
                            {legacyToolCalls.map((tool) => (
                                <ToolCallCard key={tool.id} toolCall={tool} />
                            ))}
                        </div>
                    </details>
                )}
                {message.citations && message.citations.length > 0 && (
                    <div className="llm-chat-citations">
                        <div className="llm-chat-citations-label">
                            <span className="bx bx-link" />
                            {t("llm_chat.sources")}
                        </div>
                        <ul className="llm-chat-citations-list">
                            {message.citations.map((citation, idx) => {
                                // Determine display text: title, URL hostname, or cited text
                                let displayText = citation.title;
                                if (!displayText && citation.url) {
                                    try {
                                        displayText = new URL(citation.url).hostname;
                                    } catch {
                                        displayText = citation.url;
                                    }
                                }
                                if (!displayText) {
                                    displayText = citation.citedText?.slice(0, 50) || `Source ${idx + 1}`;
                                }

                                return (
                                    <li key={idx}>
                                        {citation.url ? (
                                            <a
                                                href={citation.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={citation.citedText || citation.url}
                                            >
                                                {displayText}
                                            </a>
                                        ) : (
                                            <span title={citation.citedText}>
                                                {displayText}
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>
            <div className={`llm-chat-footer llm-chat-footer-${message.role}`}>
                <span
                    className="llm-chat-footer-time"
                    title={utils.formatDateTime(new Date(message.createdAt))}
                >
                    {utils.formatTime(new Date(message.createdAt))}
                </span>
                {message.usage && typeof message.usage.promptTokens === "number" && (
                    <>
                        {message.usage.model && (
                            <>
                                <span className="llm-chat-usage-separator">·</span>
                                <span className="llm-chat-usage-model">{message.usage.model}</span>
                            </>
                        )}
                        <span className="llm-chat-usage-separator">·</span>
                        <span
                            className="llm-chat-usage-tokens"
                            title={t("llm_chat.tokens_detail", {
                                prompt: message.usage.promptTokens.toLocaleString(),
                                completion: message.usage.completionTokens.toLocaleString()
                            })}
                        >
                            <span className="bx bx-chip" />{" "}
                            {t("llm_chat.total_tokens", { total: shortenNumber(message.usage.totalTokens) })}
                        </span>
                        {message.usage.cost != null && (
                            <>
                                <span className="llm-chat-usage-separator">·</span>
                                <span className="llm-chat-usage-cost">~${message.usage.cost.toFixed(4)}</span>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
