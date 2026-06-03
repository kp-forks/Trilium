/**
 * Pure helpers for assembling a tab's title from its splits. Kept free of DOM/appContext so the
 * formatting rules (separator, empty-split fallback, per-segment active flag) can be unit-tested.
 */

export const TAB_TITLE_SEPARATOR = " • ";

export interface TabTitleSegment {
    text: string;
    active: boolean;
}

/**
 * Builds the per-split segments and the plain tooltip string for a tab title. Each split contributes
 * one segment; an empty/untitled split falls back to `emptyLabel` so the title stays 1:1 with the panes.
 */
export function buildTabTitle(
    splits: { title: string | null | undefined; active: boolean }[],
    emptyLabel: string
): { segments: TabTitleSegment[]; tooltip: string } {
    const segments = splits.map((split) => ({
        text: split.title || emptyLabel,
        active: split.active
    }));

    return {
        segments,
        tooltip: segments.map((segment) => segment.text).join(TAB_TITLE_SEPARATOR)
    };
}
