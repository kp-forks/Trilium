import { Trans } from "react-i18next";

import { t } from "../../../services/i18n.js";
import { NewNoteLink } from "../../react/NoteLink.js";
import type { ToolCall } from "./llm_chat_types.js";

interface ToolCallContext {
    /** The primary note the tool operates on or created. */
    noteId: string | null;
    /** The parent note, shown as "in <parent>" for creation tools. */
    parentNoteId: string | null;
    /** Plain-text detail (e.g. skill name, search query) when no note ref is available. */
    detailText: string | null;
}

/** Try to extract a noteId from the tool call's result JSON. */
function parseResultNoteId(toolCall: ToolCall): string | null {
    if (!toolCall.result) return null;
    try {
        const result = typeof toolCall.result === "string"
            ? JSON.parse(toolCall.result)
            : toolCall.result;
        return result?.noteId || null;
    } catch {
        return null;
    }
}

/** Extract contextual info from a tool call for display in the summary. */
function getToolCallContext(toolCall: ToolCall): ToolCallContext {
    const input = toolCall.input;
    const parentNoteId = (input?.parentNoteId as string) || null;

    // For creation tools, the created note ID is in the result.
    if (parentNoteId) {
        const createdNoteId = parseResultNoteId(toolCall);
        if (createdNoteId) {
            return { noteId: createdNoteId, parentNoteId, detailText: null };
        }
    }

    const noteId = (input?.noteId as string) || parentNoteId || parseResultNoteId(toolCall);
    if (noteId) {
        return { noteId, parentNoteId: null, detailText: null };
    }

    const detailText = (input?.name ?? input?.query) as string | undefined;
    return { noteId: null, parentNoteId: null, detailText: detailText || null };
}

function toolCallIcon(toolCall: ToolCall): string {
    if (toolCall.isError) return "bx bx-error-circle";
    if (toolCall.result) return "bx bx-check";
    return "bx bx-loader-alt bx-spin";
}

/** Format a value for display in the key-value table. */
function formatValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value, null, 2);
}

/** Parse a JSON value (string or object) into a flat key-value record. */
function parseData(data: unknown): Record<string, unknown> | null {
    if (!data) return null;

    let obj = data;
    if (typeof obj === "string") {
        try {
            obj = JSON.parse(obj);
        } catch {
            return null;
        }
    }

    if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
        return obj as Record<string, unknown>;
    }

    return null;
}

/** Renders a key-value data object as a compact two-column table. */
function KeyValueTable({ data, className }: { data: unknown; className?: string }) {
    const record = parseData(data);

    // Fall back to raw display for non-object data (arrays, plain strings).
    if (!record) {
        const raw = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        return <pre className={className}>{raw}</pre>;
    }

    return (
        <table className={`llm-chat-tool-call-table ${className ?? ""}`}>
            <tbody>
                {Object.entries(record).map(([key, value]) => (
                    <tr key={key}>
                        <td className="llm-chat-tool-call-table-key">{key}</td>
                        <td className="llm-chat-tool-call-table-value">
                            <pre>{formatValue(value)}</pre>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export default function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
    const classes = [
        "llm-chat-tool-call-inline",
        toolCall.isError && "llm-chat-tool-call-error"
    ].filter(Boolean).join(" ");
    const { noteId: refNoteId, parentNoteId: refParentId, detailText } = getToolCallContext(toolCall);

    return (
        <details className={classes}>
            <summary className="llm-chat-tool-call-inline-summary">
                <span className={toolCallIcon(toolCall)} />
                {t(`llm.tools.${toolCall.toolName}`, { defaultValue: toolCall.toolName })}
                {detailText && (
                    <span className="llm-chat-tool-call-detail">{detailText}</span>
                )}
                {refNoteId && (
                    <span className="llm-chat-tool-call-note-ref">
                        {refParentId ? (
                            <Trans
                                i18nKey="llm.tools.note_in_parent"
                                components={{
                                    Note: <NewNoteLink notePath={refNoteId} showNoteIcon noPreview />,
                                    Parent: <NewNoteLink notePath={refParentId} showNoteIcon noPreview />
                                } as any}
                            />
                        ) : (
                            <NewNoteLink notePath={refNoteId} showNoteIcon noPreview />
                        )}
                    </span>
                )}
                {toolCall.isError && <span className="llm-chat-tool-call-error-badge">{t("llm_chat.tool_error")}</span>}
            </summary>
            <div className="llm-chat-tool-call-inline-body">
                <div className="llm-chat-tool-call-input">
                    <strong>{t("llm_chat.input")}:</strong>
                    <KeyValueTable data={toolCall.input} />
                </div>
                {toolCall.result && (
                    <div className={`llm-chat-tool-call-result ${toolCall.isError ? "llm-chat-tool-call-result-error" : ""}`}>
                        <strong>{toolCall.isError ? t("llm_chat.error") : t("llm_chat.result")}:</strong>
                        <KeyValueTable data={toolCall.result} />
                    </div>
                )}
            </div>
        </details>
    );
}
