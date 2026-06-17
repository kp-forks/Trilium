/** Label, set on a media note's parent, that opts its children into a playback mode. */
export const MEDIA_PLAY_MODE_LABEL = "mediaNotesPlayMode";

/** {@link MEDIA_PLAY_MODE_LABEL} value that auto-advances to the next sibling when playback ends. */
export const MEDIA_PLAY_MODE_AUTO = "auto";

/** The minimal slice of sibling-navigation state {@link getAutoAdvanceTarget} needs. */
export interface AutoAdvanceNavigation {
    /** 1-based position of the current item among its siblings. */
    index: number;
    /** Total number of siblings. */
    total: number;
    /** Id of the next sibling (the navigation wraps, so at the end this is the first sibling). */
    nextId: string;
}

/**
 * When a media note finishes playing, the id of the sibling to play next — or `null` to stop. Auto-advance
 * happens only when the parent opted in via `#mediaNotesPlayMode=auto`, and only to a *following* sibling: the
 * last item stops rather than wrapping back to the first.
 */
export function getAutoAdvanceTarget(playMode: string | null | undefined, navigation: AutoAdvanceNavigation | null): string | null {
    if (playMode !== MEDIA_PLAY_MODE_AUTO || !navigation) {
        return null;
    }
    // `nextId` wraps to the first sibling at the end; only advance while a later sibling actually follows.
    return navigation.index < navigation.total ? navigation.nextId : null;
}
