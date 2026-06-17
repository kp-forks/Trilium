/** Label, set on a media note's parent, that opts its children into a playback mode. */
export const MEDIA_PLAY_MODE_LABEL = "mediaNotesPlayMode";

/** {@link MEDIA_PLAY_MODE_LABEL} value that repeats the current note when it ends. */
export const MEDIA_PLAY_MODE_LOOP = "loop";

/** {@link MEDIA_PLAY_MODE_LABEL} value that auto-advances to the next sibling when playback ends. */
export const MEDIA_PLAY_MODE_AUTO = "auto";

/**
 * What a media note does when it finishes, configured per folder via {@link MEDIA_PLAY_MODE_LABEL}:
 * - `once` — stop (no loop, no auto-advance); the parent carries no label.
 * - `loop` — repeat the current note; parent label is `"loop"`.
 * - `auto` — advance to the next sibling; parent label is `"auto"`.
 */
export type MediaPlayMode = "once" | "loop" | "auto";

/** All modes, in the order shown in the play-mode menu. */
export const MEDIA_PLAY_MODES: readonly MediaPlayMode[] = [ "once", "loop", "auto" ];

/** Boxicon class for each mode — shown on the button (current mode) and beside each menu item. */
export const MEDIA_PLAY_MODE_ICONS: Record<MediaPlayMode, string> = {
    once: "bx bx-arrow-to-right",
    loop: "bx bx-repeat",
    auto: "bx bx-arrow-from-left"
};

/** i18n key for each mode's display name. */
export const MEDIA_PLAY_MODE_LABEL_KEYS: Record<MediaPlayMode, string> = {
    once: "media.play-mode-once",
    loop: "media.play-mode-loop",
    auto: "media.play-mode-auto"
};

/** The minimal slice of sibling-navigation state {@link getAutoAdvanceTarget} needs. */
export interface AutoAdvanceNavigation {
    /** 1-based position of the current item among its siblings. */
    index: number;
    /** Total number of siblings. */
    total: number;
    /** Id of the next sibling (the navigation wraps, so at the end this is the first sibling). */
    nextId: string;
}

/** The play mode encoded by a parent's {@link MEDIA_PLAY_MODE_LABEL} value; anything unrecognised is "play once". */
export function playModeFromLabel(labelValue: string | null | undefined): MediaPlayMode {
    if (labelValue === MEDIA_PLAY_MODE_LOOP) return "loop";
    if (labelValue === MEDIA_PLAY_MODE_AUTO) return "auto";
    return "once";
}

/** The {@link MEDIA_PLAY_MODE_LABEL} value to persist for a mode, or `null` when the label should be removed. */
export function playModeToLabel(mode: MediaPlayMode): string | null {
    return mode === "once" ? null : mode;
}

/** Whether the media element should loop in this mode. */
export function shouldLoop(mode: MediaPlayMode): boolean {
    return mode === "loop";
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
