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
