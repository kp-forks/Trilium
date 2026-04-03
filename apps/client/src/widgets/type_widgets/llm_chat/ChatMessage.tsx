import "./ChatMessage.css";

import { Marked } from "marked";
import { useMemo } from "preact/hooks";

import type { LlmCitation } from "@triliumnext/commons";

import { t } from "../../../services/i18n.js";
import utils from "../../../services/utils.js";
import { SanitizedHtml } from "../../react/RawHtml.js";
import { ExpandableCard, ExpandableSection } from "./ExpandableCard.js";
import { type ContentBlock, getMessageText, type StoredMessage, type TextBlock, type ToolCallBlock } from "./llm_chat_types.js";
import ToolCallCard from "./ToolCallCard.js";

function shortenNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
    return n.toString();
}

// Configure marked for safe rendering
const markedInstance = new Marked({
    breaks: true, // Convert \n to <br>
    gfm: true // GitHub Flavored Markdown
});

/** Parse markdown to HTML. Sanitization is handled by SanitizedHtml. */
function renderMarkdown(markdown: string): string {
    return markedInstance.parse(markdown) as string;
}

interface Props {
    message: StoredMessage;
    isStreaming?: boolean;
}

type ContentGroup =
    | { type: "text"; block: TextBlock; index: number }
    | { type: "tool_calls"; blocks: ToolCallBlock[]; index: number };

/** Extract domain + TLD from a hostname (e.g. "www.example.co.uk" → "example.co.uk"). */
function extractDomain(hostname: string): string {
    return hostname.replace(/^www\./, "");
}

function getUniqueSiteCount(citations: LlmCitation[]): number {
    const domains = new Set<string>();
    for (const c of citations) {
        if (c.url) {
            try {
                domains.add(extractDomain(new URL(c.url).hostname));
            } catch { /* ignore invalid URLs */ }
        }
    }
    return domains.size;
}

function CitationsSection({ citations }: { citations: LlmCitation[] }) {
    const siteCount = getUniqueSiteCount(citations);
    const summary = t("llm_chat.sources_summary", { count: citations.length, sites: siteCount });

    return (
        <ExpandableCard>
            <ExpandableSection icon="bx bx-link" label={summary}>
                <table className="llm-chat-citations-list">
                    <tbody>
                        {citations.map((citation, idx) => {
                            const title = citation.title || citation.citedText?.slice(0, 80) || `Source ${idx + 1}`;
                            let domain: string | null = null;
                            if (citation.url) {
                                try {
                                    domain = extractDomain(new URL(citation.url).hostname);
                                } catch { /* ignore */ }
                            }

                            return (
                                <tr key={idx}>
                                    <td className="llm-chat-citation-title">
                                        {citation.url ? (
                                            <a href={citation.url} target="_blank" rel="noopener noreferrer" title={title}>
                                                {title}
                                            </a>
                                        ) : (
                                            <span>{title}</span>
                                        )}
                                    </td>
                                    {domain && (
                                        <td className="llm-chat-citation-site">{domain}</td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </ExpandableSection>
        </ExpandableCard>
    );
}

export default function ChatMessage({ message, isStreaming }: Props) {
    const roleLabel = message.role === "user" ? t("llm_chat.role_user") : t("llm_chat.role_assistant");
    const isError = message.type === "error";
    const isThinking = message.type === "thinking";
    const textContent = typeof message.content === "string" ? message.content : getMessageText(message.content);

    // Render markdown for assistant messages with legacy string content
    const renderedContent = useMemo(() => {
        if (message.role === "assistant" && !isError && !isThinking && typeof message.content === "string") {
            return renderMarkdown(message.content);
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
                                <SanitizedHtml className="llm-chat-markdown" html={renderedContent || ""} />
                                {isStreaming && <span className="llm-chat-cursor" />}
                            </>
                        )
                    ) : (
                        textContent
                    )}
                </div>
                {message.citations && message.citations.length > 0 && (
                    <CitationsSection citations={message.citations} />
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

/** Group content blocks so that consecutive tool_calls are merged into one entry. */
function groupContentBlocks(blocks: ContentBlock[]): ContentGroup[] {
    const groups: ContentGroup[] = [];

    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (block.type === "tool_call") {
            const last = groups[groups.length - 1];
            if (last?.type === "tool_calls") {
                last.blocks.push(block);
            } else {
                groups.push({ type: "tool_calls", blocks: [block], index: i });
            }
        } else {
            groups.push({ type: "text", block, index: i });
        }
    }

    return groups;
}

function renderContentBlocks(blocks: ContentBlock[], isStreaming?: boolean) {
    return groupContentBlocks(blocks).map((group) => {
        if (group.type === "text") {
            const html = renderMarkdown(group.block.content);
            return (
                <div key={group.index}>
                    <SanitizedHtml className="llm-chat-markdown" html={html} />
                    {isStreaming && group.index === blocks.length - 1 && <span className="llm-chat-cursor" />}
                </div>
            );
        }

        return <ToolCallCard key={group.index} toolCalls={group.blocks.map((b) => b.toolCall)} />;
    });
}
