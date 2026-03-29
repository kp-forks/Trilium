import type { RefObject } from "preact";
import type { UseLlmChatReturn } from "./useLlmChat.js";
import { t } from "../../../services/i18n.js";
import FormDropdownList from "../../react/FormDropdownList.js";

/** Format token count with thousands separators */
function formatTokenCount(tokens: number): string {
    return tokens.toLocaleString();
}

interface ChatInputBarProps {
    /** The chat hook result */
    chat: UseLlmChatReturn;
    /** Custom submit handler (overrides chat.handleSubmit) */
    onSubmit?: (e: Event) => void;
    /** Custom key down handler (overrides chat.handleKeyDown) */
    onKeyDown?: (e: KeyboardEvent) => void;
    /** Callback when web search toggle changes */
    onWebSearchChange?: () => void;
    /** Callback when note tools toggle changes */
    onNoteToolsChange?: () => void;
    /** Callback when extended thinking toggle changes */
    onExtendedThinkingChange?: () => void;
    /** Callback when model changes */
    onModelChange?: (model: string) => void;
}

export default function ChatInputBar({
    chat,
    onSubmit,
    onKeyDown,
    onWebSearchChange,
    onNoteToolsChange,
    onExtendedThinkingChange,
    onModelChange
}: ChatInputBarProps) {
    const handleSubmit = onSubmit ?? chat.handleSubmit;
    const handleKeyDown = onKeyDown ?? chat.handleKeyDown;

    const handleWebSearchToggle = () => {
        chat.setEnableWebSearch(!chat.enableWebSearch);
        onWebSearchChange?.();
    };

    const handleNoteToolsToggle = () => {
        chat.setEnableNoteTools(!chat.enableNoteTools);
        onNoteToolsChange?.();
    };

    const handleExtendedThinkingToggle = () => {
        chat.setEnableExtendedThinking(!chat.enableExtendedThinking);
        onExtendedThinkingChange?.();
    };

    const handleModelSelect = (model: string) => {
        chat.setSelectedModel(model);
        onModelChange?.(model);
    };

    const currentModel = chat.availableModels.find(m => m.id === chat.selectedModel);
    const contextWindow = currentModel?.contextWindow || 200000;
    const percentage = Math.min((chat.lastPromptTokens / contextWindow) * 100, 100);
    const isWarning = percentage > 75;
    const isCritical = percentage > 90;
    const pieColor = isCritical ? "var(--danger-color, #d9534f)" : isWarning ? "var(--warning-color, #f0ad4e)" : "var(--main-selection-color, #007bff)";

    return (
        <form className="llm-chat-input-form" onSubmit={handleSubmit}>
            <div className="llm-chat-input-row">
                <textarea
                    ref={chat.textareaRef as RefObject<HTMLTextAreaElement>}
                    className="llm-chat-input"
                    value={chat.input}
                    onInput={(e) => chat.setInput((e.target as HTMLTextAreaElement).value)}
                    placeholder={t("llm_chat.placeholder")}
                    disabled={chat.isStreaming}
                    onKeyDown={handleKeyDown}
                    rows={3}
                />
                <button
                    type="submit"
                    className="llm-chat-send-btn"
                    disabled={chat.isStreaming || !chat.input.trim()}
                >
                    {chat.isStreaming ? t("llm_chat.sending") : t("llm_chat.send")}
                </button>
            </div>
            <div className="llm-chat-options">
                <div className="llm-chat-model-selector">
                    <span className="bx bx-chip" />
                    <FormDropdownList
                        values={chat.availableModels}
                        keyProperty="id"
                        titleProperty="name"
                        descriptionProperty="costDescription"
                        currentValue={chat.selectedModel}
                        onChange={handleModelSelect}
                        disabled={chat.isStreaming}
                        buttonClassName="llm-chat-model-select"
                    />
                </div>
                <label className="llm-chat-toggle">
                    <input
                        type="checkbox"
                        checked={chat.enableWebSearch}
                        onChange={handleWebSearchToggle}
                        disabled={chat.isStreaming}
                    />
                    <span className="bx bx-globe" />
                    {t("llm_chat.web_search")}
                </label>
                <label className="llm-chat-toggle">
                    <input
                        type="checkbox"
                        checked={chat.enableNoteTools}
                        onChange={handleNoteToolsToggle}
                        disabled={chat.isStreaming}
                    />
                    <span className="bx bx-note" />
                    {t("llm_chat.note_tools")}
                </label>
                <label className="llm-chat-toggle">
                    <input
                        type="checkbox"
                        checked={chat.enableExtendedThinking}
                        onChange={handleExtendedThinkingToggle}
                        disabled={chat.isStreaming}
                    />
                    <span className="bx bx-brain" />
                    {t("llm_chat.extended_thinking")}
                </label>
                {chat.lastPromptTokens > 0 && (
                    <div
                        className="llm-chat-context-pie"
                        title={`${formatTokenCount(chat.lastPromptTokens)} / ${formatTokenCount(contextWindow)} ${t("llm_chat.tokens")} (${percentage.toFixed(0)}%)`}
                        style={{
                            background: `conic-gradient(${pieColor} ${percentage}%, var(--accented-background-color) ${percentage}%)`
                        }}
                    />
                )}
            </div>
        </form>
    );
}
