/** Splits a note path into the parent path and parent note id (clone-aware: uses the in-tab path). */
export function getParentFromNotePath(notePath: string | null | undefined): { parentPath: string; parentNoteId: string } | null {
    if (!notePath) return null;
    const parts = notePath.split("/");
    if (parts.length < 2) return null;
    return { parentPath: parts.slice(0, -1).join("/"), parentNoteId: parts[parts.length - 2] };
}

/**
 * From the ordered note ids of the matching siblings (including the current note) and the current
 * note id, returns the previous/next sibling — wrapping around infinitely — plus the first/last
 * sibling, the 1-based index and total. Returns null when the current note isn't among them or there
 * are fewer than two.
 */
export function getSiblingNavigation(siblingNoteIds: string[], currentNoteId: string): { previous: string; next: string; first: string; last: string; index: number; total: number } | null {
    const index = siblingNoteIds.indexOf(currentNoteId);
    const total = siblingNoteIds.length;
    if (index === -1 || total < 2) return null;
    return {
        previous: siblingNoteIds[(index - 1 + total) % total],
        next: siblingNoteIds[(index + 1) % total],
        first: siblingNoteIds[0],
        last: siblingNoteIds[total - 1],
        index: index + 1,
        total
    };
}

export type SiblingDirection = "previous" | "next" | "first" | "last";

/**
 * Maps a `KeyboardEvent.code` to a navigation direction. PageUp/PageDown (prev/next) and Home/End
 * (first/last) are built in; a renderer can supply extra codes for prev/next (e.g. the image viewer
 * adds `Backspace`/`Space`). Using `code` keeps it keyboard-layout independent.
 */
export function codeToSiblingDirection(code: string, extraPrevious: readonly string[], extraNext: readonly string[]): SiblingDirection | null {
    if (code === "PageUp" || extraPrevious.includes(code)) return "previous";
    if (code === "PageDown" || extraNext.includes(code)) return "next";
    if (code === "Home") return "first";
    if (code === "End") return "last";
    return null;
}

/** Whether the event originated in a text-entry field, where navigation keys must not be hijacked. */
export function isTextEntryTarget(target: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
    if (!target?.tagName) return false;
    const tag = target.tagName.toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable === true;
}

/** Whether the target is an interactive control that uses Space/Enter for activation (so we must not hijack Space from it). */
export function isInteractiveTarget(target: { tagName?: string; getAttribute?(name: string): string | null } | null | undefined): boolean {
    if (!target?.tagName) return false;
    const tag = target.tagName.toUpperCase();
    return tag === "BUTTON" || tag === "A" || tag === "SUMMARY" || target.getAttribute?.("role") === "button";
}
