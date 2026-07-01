import type { RefObject } from "preact";
import { useEffect } from "preact/hooks";

import { MESSAGE_JUMP_CLASS } from "./chat_quote.js";

/** Transient class that flashes the jumped-to message so the user sees where they landed. */
const FLASH_CLASS = "llm-chat-message-jump-target";
/** Kept in sync with the flash animation duration in ChatMessage.css. */
const FLASH_DURATION_MS = 1200;

/**
 * Makes the "message ID …" jump links in submitted quotes clickable: scrolls the referenced message
 * into view and briefly flashes it. One delegated listener on the timeline covers the links in every
 * message, so there's no per-message wiring. A missing target (the referenced message was deleted or
 * regenerated) is a graceful no-op — mirroring how highlights drop orphaned anchors.
 */
export function useChatMessageJumps(scrollContainerRef: RefObject<HTMLElement>) {
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const onClick = (e: MouseEvent) => {
            const link = (e.target as HTMLElement | null)?.closest<HTMLElement>(`.${MESSAGE_JUMP_CLASS}`);
            const targetId = link?.dataset.messageId;
            if (!targetId) return;
            e.preventDefault();

            // Match on the parsed dataset value rather than an attribute selector: persisted/imported
            // chats may carry ids with characters that would make a selector invalid and throw.
            let wrapper: HTMLElement | null = null;
            for (const el of container.querySelectorAll<HTMLElement>("[data-message-id]")) {
                if (el.dataset.messageId === targetId) { wrapper = el; break; }
            }
            if (!wrapper) return; // referenced message is gone — nothing to jump to

            wrapper.scrollIntoView({ block: "center", behavior: "smooth" });
            // Re-trigger the flash on repeat clicks: remove, force a reflow, then re-add.
            wrapper.classList.remove(FLASH_CLASS);
            void wrapper.offsetWidth;
            wrapper.classList.add(FLASH_CLASS);
            window.setTimeout(() => wrapper.classList.remove(FLASH_CLASS), FLASH_DURATION_MS);
        };

        container.addEventListener("click", onClick);
        return () => container.removeEventListener("click", onClick);
    }, [scrollContainerRef]);
}
