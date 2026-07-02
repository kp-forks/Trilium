import "./chat_highlights.css";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import type NoteContext from "../../../components/note_context.js";
import contextMenu, { type MenuItem } from "../../../menus/context_menu.js";
import { t } from "../../../services/i18n.js";
import toast from "../../../services/toast.js";
import { randomString } from "../../../services/utils.js";
import { canCopyMessage, copyMessageToClipboard } from "./chat_copy.js";
import { createAnchorFromSelection, resolveAnchorRange } from "./chat_highlights_anchor.js";
import { buildQuoteMarkdown } from "./chat_quote.js";
import { canSaveToSubNote, saveMessageToSubNote } from "./chat_save.js";
import { getMessageText, type HighlightAnchor } from "./llm_chat_types.js";
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

type RangeMap = Map<string, { range: Range; messageId: string }>;

// A `::highlight()` name is global to the document, so every open chat shares this one registry entry
// instead of each registering its own (which would evict the others on set/delete — broken with two
// chats open in split panes). Each live hook instance contributes its resolved ranges; the entry is
// rebuilt from all of them and removed only once the last chat unmounts.
const activeRangeMaps = new Set<{ current: RangeMap }>();
let sharedHighlight: Highlight | null = null;

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
    const appendToInputRef = useRef(chat.appendToInput);
    appendToInputRef.current = chat.appendToInput;
    // Present for note chats (a real note in a tab), undefined for the right-pane sidebar chat —
    // used to gate "Save to sub-note" (note chats only) and as the new note's parent.
    const noteContextRef = useRef(noteContext);
    noteContextRef.current = noteContext;

    // The resolved ranges behind this chat's currently painted highlights, keyed by anchor id (used
    // for hit-testing on right-click and for scroll-to). Registered in the module-level set so the
    // shared highlight can paint every open chat's ranges.
    const rangesRef = useRef<RangeMap>(new Map());

    // Rebuild ranges from the stored anchors and repaint. A layout effect so painting settles in the
    // same frame the messages render — no flash. The stream keeps `messages` stable, so this doesn't
    // run per token.
    const recompute = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const rangeById: RangeMap = new Map();
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
        activeRangeMaps.add(rangesRef);
        repaintChatHighlights();
        setHighlightItems(items);
    }, [scrollContainerRef]);

    useLayoutEffect(() => recompute(), [messages, recompute]);

    // On unmount, drop this chat's ranges from the shared highlight (and the registry entry with the
    // last chat), so a switched-away chat leaves no paint behind.
    useEffect(() => () => releaseRangeMap(rangesRef), []);

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
        // Reuse the range resolved by the most recent recompute rather than re-walking the DOM; every
        // listed highlight has a cached entry (the list is built from the same resolved set).
        const entry = rangesRef.current.get(anchorId);
        const element = entry && nearestElement(entry.range.startContainer);
        element?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, []);

    // Right-click menu over the timeline. With a text selection: Copy, Quote, and Add/Remove
    // highlight. With no selection: Copy the whole message, and Save it to a sub-note (note chats
    // only). Because preventing the default menu drops the browser's own Copy, we provide it here.
    // Bails (leaving the native menu) when there's nothing to offer. Copy stays available while a
    // reply streams; only the message-mutating add/remove are suppressed then.
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const onContextMenu = (e: MouseEvent) => {
            const wrapper = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-message-id]");
            const messageId = wrapper?.dataset.messageId;
            const root = wrapper?.querySelector<HTMLElement>(".llm-chat-message-content");
            if (!messageId || !root) return; // thinking/error messages carry no id → nothing to offer

            const streaming = isStreamingRef.current;
            const hitId = streaming ? null : highlightAtPoint(rangesRef.current, messageId, e.clientX, e.clientY);
            const selectionRange = selectionRangeWithin(container.ownerDocument.getSelection(), root);
            const built = !streaming && selectionRange ? createAnchorFromSelection(root, selectionRange) : null;

            const items: MenuItem<unknown>[] = [];
            // Copy the live selection as rich text: execCommand serializes the selected DOM to both
            // text/html and text/plain (what the native menu we suppressed would have done).
            if (selectionRange?.toString().trim()) {
                items.push({ title: t("llm_chat.copy"), uiIcon: "bx bx-copy", handler: copySelection });
            }
            if (hitId) {
                items.push({ title: t("llm_chat.highlight_remove"), uiIcon: "bx bx-eraser", handler: () => removeHighlight(hitId) });
            } else if (built) {
                items.push({ title: t("llm_chat.highlight_add"), uiIcon: "bx bx-highlight", handler: () => addHighlight(messageId, built) });
            }

            // Quote the selection into the reply input. Disabled while streaming — the input is
            // read-only then, so there's nowhere to write it. Text is captured now (the menu can
            // clear the live selection before the handler runs).
            const quotedText = !streaming ? selectionRange?.toString() : undefined;
            if (quotedText?.trim()) {
                items.push({
                    title: t("llm_chat.quote_selection"),
                    uiIcon: "bx bxs-quote-alt-left",
                    handler: () => appendToInputRef.current(buildQuoteMarkdown(quotedText, messageId))
                });
            }

            // Save the whole message as a child note and open it in this tab. Note chats only — the
            // right-pane sidebar chat has no note to parent under (no noteContext). Rendered from the
            // message's markdown source so math, mermaid, and code survive intact. Offered on the
            // message surface only when there's no text selection: with a selection the selection
            // commands above apply, and a whole-message save would then be confusing.
            const parentNotePath = noteContextRef.current?.notePath;
            const hasSelection = !!selectionRange?.toString().trim();
            const message = messagesRef.current.find(m => m.id === messageId);
            const messageMarkdown = message ? getMessageText(message.content) : "";
            if (canCopyMessage(hasSelection, messageMarkdown)) {
                items.push({
                    title: t("llm_chat.copy_message"),
                    uiIcon: "bx bx-copy",
                    handler: () => copyMessageToClipboard(messageMarkdown)
                });
            }
            if (parentNotePath && canSaveToSubNote(parentNotePath, hasSelection, messageMarkdown)) {
                items.push({
                    title: t("llm_chat.save_to_subnote"),
                    uiIcon: "bx bx-save",
                    handler: () => void saveMessageToSubNote(parentNotePath, messageMarkdown)
                });
            }

            if (items.length === 0) return; // nothing to do → leave the native menu
            e.preventDefault();
            showMenu(e, items);
        };

        container.addEventListener("contextmenu", onContextMenu);
        return () => container.removeEventListener("contextmenu", onContextMenu);
    }, [scrollContainerRef, addHighlight, removeHighlight]);

    // Publish the list for the sidebar widget.
    useEffect(() => {
        noteContext?.setContextData("chatHighlights", { highlights: highlightItems, scrollToHighlight, removeHighlight });
    }, [noteContext, highlightItems, scrollToHighlight, removeHighlight]);

    // Clear the published data when this context goes away (note switch or unmount), so the sidebar
    // doesn't keep showing a stale list. Kept separate from the publish effect above — clearing there
    // would flash the list empty on every update.
    useEffect(() => () => noteContext?.clearContextData("chatHighlights"), [noteContext]);
}

function isHighlightApiAvailable(): boolean {
    return typeof Highlight !== "undefined" && typeof CSS !== "undefined" && !!CSS.highlights;
}

/** Rebuild the shared registry entry from every open chat's ranges. */
function repaintChatHighlights() {
    if (!isHighlightApiAvailable()) return;
    if (!sharedHighlight) {
        sharedHighlight = new Highlight();
        CSS.highlights.set(HIGHLIGHT_NAME, sharedHighlight);
    }
    sharedHighlight.clear();
    for (const ref of activeRangeMaps) {
        for (const { range } of ref.current.values()) sharedHighlight.add(range);
    }
}

/** Drop one chat's ranges; remove the registry entry entirely once no chats remain. */
function releaseRangeMap(ref: { current: RangeMap }) {
    activeRangeMaps.delete(ref);
    if (activeRangeMaps.size === 0) {
        if (isHighlightApiAvailable()) CSS.highlights.delete(HIGHLIGHT_NAME);
        sharedHighlight = null;
    } else {
        repaintChatHighlights();
    }
}

function findMessageContentRoot(container: HTMLElement, messageId: string): HTMLElement | null {
    // Match on the parsed dataset value rather than an attribute selector: persisted/imported chats
    // may carry ids with characters that would make a selector invalid and throw.
    for (const el of container.querySelectorAll<HTMLElement>("[data-message-id]")) {
        if (el.dataset.messageId === messageId) return el.querySelector<HTMLElement>(".llm-chat-message-content");
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

function showMenu(e: MouseEvent, items: MenuItem<unknown>[]) {
    void contextMenu.show({ x: e.pageX, y: e.pageY, items, selectMenuItemHandler: () => {} });
}

/** Copy the current selection as rich text. The menu opens on mousedown, so the selection is still live. */
function copySelection() {
    const ok = document.execCommand("copy");
    if (ok) {
        toast.showMessage(t("clipboard.copy_success"));
    } else {
        toast.showError(t("clipboard.copy_failed"));
    }
}
