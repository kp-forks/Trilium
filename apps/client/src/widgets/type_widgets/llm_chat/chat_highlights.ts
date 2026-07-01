import "./chat_highlights.css";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import type NoteContext from "../../../components/note_context.js";
import contextMenu, { type MenuItem } from "../../../menus/context_menu.js";
import { t } from "../../../services/i18n.js";
import { randomString } from "../../../services/utils.js";
import { createAnchorFromSelection, resolveAnchorRange } from "./chat_highlights_anchor.js";
import type { HighlightAnchor, StoredMessage } from "./llm_chat_types.js";
import type { UseLlmChatReturn } from "./useLlmChat.js";

/** A highlight surfaced in the sidebar list. */
export interface ChatHighlightItem {
    id: string;
    messageId: string;
    /** The highlighted prose, shown as the list entry's label. */
    text: string;
}

/** Context data published for the {@link ChatHighlightsList} sidebar widget. */
export interface ChatHighlightsContext {
    highlights: ChatHighlightItem[];
    scrollToHighlight(id: string): void;
    removeHighlight(id: string): void;
}

/** The single CSS Custom Highlight registry entry all chat highlights paint through. */
const HIGHLIGHT_NAME = "chat-highlight";

/**
 * Wires up user-created highlights for an AI chat: painting stored highlights over the rendered
 * prose, a right-click menu to add and remove them, and publishing the list to the note context so
 * the shared sidebar widget can display it — mirroring {@link useChatToc}.
 *
 * Highlights are painted with the CSS Custom Highlight API rather than by wrapping text in elements,
 * so nothing is injected into the Preact-owned message DOM. Because that paints over live `Range`s
 * (which go stale when a message re-renders), the ranges are rebuilt from the stored anchors on every
 * message change.
 */
export function useChatHighlights(chat: UseLlmChatReturn, noteContext: NoteContext | undefined) {
    const { messages, isStreaming, scrollContainerRef } = chat;
    const [highlightItems, setHighlightItems] = useState<ChatHighlightItem[]>([]);

    // Latest values for the imperative event handler and callbacks, so they never read stale state.
    const messagesRef = useRef(messages);
    messagesRef.current = messages;
    const isStreamingRef = useRef(isStreaming);
    isStreamingRef.current = isStreaming;
    const setMessagesRef = useRef(chat.setMessages);
    setMessagesRef.current = chat.setMessages;

    // Live registry entry + the resolved ranges behind the currently painted highlights, keyed by
    // anchor id (used for hit-testing on right-click).
    const highlightRef = useRef<Highlight | null>(null);
    const rangesRef = useRef(new Map<string, { range: Range; messageId: string }>());

    const paint = useCallback((rangeById: Map<string, { range: Range; messageId: string }>) => {
        const highlight = ensureHighlight(highlightRef);
        if (!highlight) return;
        highlight.clear();
        for (const { range } of rangeById.values()) highlight.add(range);
    }, []);

    // Rebuild ranges from the stored anchors and repaint. A layout effect so painting settles in the
    // same frame the messages render — no flash. The stream keeps `messages` stable, so this doesn't
    // run per token.
    const recompute = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const rangeById = new Map<string, { range: Range; messageId: string }>();
        const items: ChatHighlightItem[] = [];
        for (const message of messagesRef.current) {
            if (!message.highlights?.length) continue;
            const root = findMessageContentRoot(container, message.id);
            if (!root) continue;
            for (const anchor of message.highlights) {
                const range = resolveAnchorRange(root, anchor);
                if (!range) continue; // orphaned (e.g. regenerated message) — drop cleanly, never mis-paint
                rangeById.set(anchor.id, { range, messageId: message.id });
                items.push({ id: anchor.id, messageId: message.id, text: anchor.quotedText });
            }
        }

        rangesRef.current = rangeById;
        paint(rangeById);
        setHighlightItems(items);
    }, [scrollContainerRef, paint]);

    useLayoutEffect(() => recompute(), [messages, recompute]);

    // Drop the registry entry on unmount so a switched-away chat leaves no paint behind.
    useEffect(() => () => {
        highlightRef.current = null;
        if (isHighlightApiAvailable()) CSS.highlights.delete(HIGHLIGHT_NAME);
    }, []);

    const addHighlight = useCallback((messageId: string, built: Omit<HighlightAnchor, "id">) => {
        const anchor: HighlightAnchor = { id: randomString(), ...built };
        setMessagesRef.current(messagesRef.current.map(message =>
            message.id === messageId
                ? { ...message, highlights: [...(message.highlights ?? []), anchor] }
                : message
        ));
    }, []);

    const removeHighlight = useCallback((anchorId: string) => {
        setMessagesRef.current(messagesRef.current.map(message => {
            if (!message.highlights?.some(h => h.id === anchorId)) return message;
            const remaining = message.highlights.filter(h => h.id !== anchorId);
            return { ...message, highlights: remaining.length ? remaining : undefined };
        }));
    }, []);

    const scrollToHighlight = useCallback((anchorId: string) => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const located = findAnchor(messagesRef.current, anchorId);
        if (!located) return;
        const root = findMessageContentRoot(container, located.messageId);
        if (!root) return;
        const range = resolveAnchorRange(root, located.anchor);
        const element = range && nearestElement(range.startContainer);
        element?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, [scrollContainerRef]);

    // Right-click: remove when the click lands on an existing highlight, else offer to highlight a
    // prose selection. Attached to the timeline; both paths bail (leaving the native menu) when there's
    // nothing to do, so ordinary right-clicks are untouched.
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const onContextMenu = (e: MouseEvent) => {
            if (isStreamingRef.current) return; // mutating messages mid-stream would race the finalized reply
            const wrapper = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-message-id]");
            const messageId = wrapper?.dataset.messageId;
            const root = wrapper?.querySelector<HTMLElement>(".llm-chat-message-content");
            if (!messageId || !root) return; // thinking/error messages carry no id → not highlightable

            const hitId = highlightAtPoint(rangesRef.current, messageId, e.clientX, e.clientY);
            if (hitId) {
                e.preventDefault();
                showMenu(e, t("llm_chat.highlight_remove"), "bx bx-eraser", () => removeHighlight(hitId));
                return;
            }

            const range = selectionRangeWithin(container.ownerDocument.getSelection(), root);
            const built = range && createAnchorFromSelection(root, range);
            if (!built) return;
            e.preventDefault();
            showMenu(e, t("llm_chat.highlight_add"), "bx bx-highlight", () => addHighlight(messageId, built));
        };

        container.addEventListener("contextmenu", onContextMenu);
        return () => container.removeEventListener("contextmenu", onContextMenu);
    }, [scrollContainerRef, addHighlight, removeHighlight]);

    // Publish the list for the sidebar widget; clear it on unmount so no stale list lingers.
    useEffect(() => {
        noteContext?.setContextData("chatHighlights", { highlights: highlightItems, scrollToHighlight, removeHighlight });
    }, [noteContext, highlightItems, scrollToHighlight, removeHighlight]);

    const noteContextRef = useRef(noteContext);
    noteContextRef.current = noteContext;
    useEffect(() => () => noteContextRef.current?.clearContextData("chatHighlights"), []);
}

function isHighlightApiAvailable(): boolean {
    return typeof Highlight !== "undefined" && typeof CSS !== "undefined" && !!CSS.highlights;
}

function ensureHighlight(ref: { current: Highlight | null }): Highlight | null {
    if (ref.current) return ref.current;
    if (!isHighlightApiAvailable()) return null;
    const highlight = new Highlight();
    ref.current = highlight;
    CSS.highlights.set(HIGHLIGHT_NAME, highlight);
    return highlight;
}

function findMessageContentRoot(container: HTMLElement, messageId: string): HTMLElement | null {
    // Match on the parsed dataset value rather than an attribute selector: persisted/imported chats
    // may carry ids with characters that would make a selector invalid and throw.
    for (const el of container.querySelectorAll<HTMLElement>("[data-message-id]")) {
        if (el.dataset.messageId === messageId) return el.querySelector<HTMLElement>(".llm-chat-message-content");
    }
    return null;
}

function findAnchor(messages: StoredMessage[], anchorId: string): { anchor: HighlightAnchor; messageId: string } | null {
    for (const message of messages) {
        const anchor = message.highlights?.find(h => h.id === anchorId);
        if (anchor) return { anchor, messageId: message.id };
    }
    return null;
}

/** The selection's range if it is non-empty and fully contained within `root`, else null. */
function selectionRangeWithin(selection: Selection | null, root: HTMLElement): Range | null {
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    return range;
}

/** The id of the smallest highlight (of `messageId`) painted under the given viewport point, if any. */
function highlightAtPoint(ranges: Map<string, { range: Range; messageId: string }>, messageId: string, x: number, y: number): string | null {
    const caret = caretFromPoint(document, x, y);
    if (!caret) return null;

    let bestId: string | null = null;
    let bestLength = Infinity;
    for (const [id, { range, messageId: owner }] of ranges) {
        if (owner !== messageId) continue;
        try {
            if (!range.isPointInRange(caret.node, caret.offset)) continue;
        } catch {
            continue; // point in a different document subtree
        }
        const length = range.toString().length;
        if (length < bestLength) {
            bestLength = length;
            bestId = id;
        }
    }
    return bestId;
}

function caretFromPoint(doc: Document, x: number, y: number): { node: Node; offset: number } | null {
    if (typeof doc.caretPositionFromPoint === "function") {
        const pos = doc.caretPositionFromPoint(x, y);
        return pos?.offsetNode ? { node: pos.offsetNode, offset: pos.offset } : null;
    }
    // Older Chromium/Electron only expose the WebKit-prefixed variant.
    const legacy = (doc as unknown as { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint;
    if (typeof legacy === "function") {
        const range = legacy.call(doc, x, y);
        return range ? { node: range.startContainer, offset: range.startOffset } : null;
    }
    return null;
}

function nearestElement(node: Node): HTMLElement | null {
    return node instanceof HTMLElement ? node : node.parentElement;
}

function showMenu(e: MouseEvent, title: string, uiIcon: string, handler: () => void) {
    const items: MenuItem<unknown>[] = [{ title, uiIcon, handler }];
    void contextMenu.show({ x: e.pageX, y: e.pageY, items, selectMenuItemHandler: () => {} });
}
