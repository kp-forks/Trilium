/** Splits a note path into the parent path and parent note id (clone-aware: uses the in-tab path). */
export function getParentFromNotePath(notePath: string | null | undefined): { parentPath: string; parentNoteId: string } | null {
    if (!notePath) return null;
    const parts = notePath.split("/");
    if (parts.length < 2) return null;
    return { parentPath: parts.slice(0, -1).join("/"), parentNoteId: parts[parts.length - 2] };
}

/**
 * From the ordered note ids of the matching siblings (including the current note) and the current
 * note id, returns the previous/next sibling — wrapping around infinitely — plus the 1-based index
 * and total. Returns null when the current note isn't among them or there are fewer than two.
 */
export function getSiblingNavigation(siblingNoteIds: string[], currentNoteId: string): { previous: string; next: string; index: number; total: number } | null {
    const index = siblingNoteIds.indexOf(currentNoteId);
    const total = siblingNoteIds.length;
    if (index === -1 || total < 2) return null;
    return {
        previous: siblingNoteIds[(index - 1 + total) % total],
        next: siblingNoteIds[(index + 1) % total],
        index: index + 1,
        total
    };
}
