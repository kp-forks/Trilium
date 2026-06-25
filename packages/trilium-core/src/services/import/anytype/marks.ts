/**
 * Converts an Anytype text block's inline marks into HTML. Anytype encodes formatting as a flat list of
 * marks, each a `[from, to)` character range (UTF-16 offsets) with a type — and marks may overlap freely.
 * We turn that into valid nested HTML by splitting the text at every mark boundary, so no segment straddles
 * a mark edge, then wrapping each segment in the tags whose range fully covers it. Adjacent segments always
 * differ in their active set (a boundary is only created where a mark starts or ends), so the output is
 * clean without a merge pass.
 *
 * Only the structural text marks are rendered for now; colours, links, mentions and emoji are ignored,
 * leaving their text as plain (escaped) content.
 */

import type { AnytypeMark } from "./model.js";

const MARK_TAGS: Record<string, string> = {
    Bold: "strong",
    Italic: "em",
    Underscored: "u",
    Strikethrough: "s",
    Keyboard: "code"
};

// Outer-to-inner nesting order for marks that cover the same segment — fixed so output is deterministic.
const MARK_ORDER = ["Bold", "Italic", "Underscored", "Strikethrough", "Keyboard"];

interface AppliedMark {
    type: string;
    from: number;
    to: number;
}

export function renderInlineText(text: string, marks: AnytypeMark[]): string {
    const length = text.length;

    // Keep only marks we render, with offsets clamped to the text and empty/reversed ranges dropped.
    const applicable: AppliedMark[] = [];
    for (const mark of marks) {
        if (mark.type === undefined || !(mark.type in MARK_TAGS)) {
            continue;
        }
        const from = Math.max(0, Math.min(length, mark.range?.from ?? 0));
        const to = Math.max(0, Math.min(length, mark.range?.to ?? 0));
        if (from < to) {
            applicable.push({ type: mark.type, from, to });
        }
    }

    if (applicable.length === 0) {
        return escapeHtml(text);
    }

    // Split at every mark boundary so each segment is uniformly covered (or not) by each mark.
    const boundaries = new Set<number>([0, length]);
    for (const mark of applicable) {
        boundaries.add(mark.from);
        boundaries.add(mark.to);
    }
    const points = [...boundaries].sort((a, b) => a - b);

    let html = "";
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        const segment = escapeHtml(text.slice(start, end));

        const active = MARK_ORDER.filter((type) => applicable.some((mark) => mark.type === type && mark.from <= start && mark.to >= end));
        const open = active.map((type) => `<${MARK_TAGS[type]}>`).join("");
        const close = active.map((type) => `</${MARK_TAGS[type]}>`).reverse().join("");
        html += open + segment + close;
    }

    return html;
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
