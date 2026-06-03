/**
 * Pure helpers for assembling a tab's title from its splits. Kept free of DOM/appContext so the
 * formatting rules (separator, empty-split fallback, per-segment active flag) can be unit-tested.
 */

export const TAB_TITLE_SEPARATOR = " • ";

export interface TabTitleSegment {
    text: string;
    active: boolean;
}

/** Escapes HTML special characters so note titles can be safely embedded in the tooltip markup. */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Builds the per-split segments and the tooltip strings for a tab title. Each split contributes one
 * segment; an empty/untitled split falls back to `emptyLabel` so the title stays 1:1 with the panes.
 *
 * `tooltip` is plain text; `tooltipHtml` escapes every title (untrusted) and wraps the active split in
 * trusted `<strong>` so it stands out — only the surrounding markup is trusted, never the titles.
 */
export function buildTabTitle(
    splits: { title: string | null | undefined; active: boolean }[],
    emptyLabel: string
): { segments: TabTitleSegment[]; tooltip: string; tooltipHtml: string } {
    const segments = splits.map((split) => ({
        text: split.title || emptyLabel,
        active: split.active
    }));

    return {
        segments,
        tooltip: segments.map((segment) => segment.text).join(TAB_TITLE_SEPARATOR),
        tooltipHtml: segments
            .map((segment) => {
                const escaped = escapeHtml(segment.text);
                return segment.active ? `<strong>${escaped}</strong>` : escaped;
            })
            .join(TAB_TITLE_SEPARATOR)
    };
}
