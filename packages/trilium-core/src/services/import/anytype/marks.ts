/**
 * Converts an Anytype text block's inline marks into HTML. Anytype encodes formatting as a flat list of
 * marks, each a `[from, to)` character range (UTF-16 offsets) with a type — and marks may overlap freely.
 * We turn that into valid nested HTML by splitting the text at every mark boundary, so no segment straddles
 * a mark edge, then wrapping each segment in the tags whose range fully covers it. Adjacent segments always
 * differ in their active set (a boundary is only created where a mark starts or ends), so the output is
 * clean without a merge pass.
 *
 * Structural marks (bold/italic/…) and text/background colours are rendered; links, mentions and emoji
 * are ignored for now, leaving their text as plain (escaped) content.
 */

import type { AnytypeMark } from "./model.js";

const MARK_TAGS: Record<string, string> = {
    Bold: "strong",
    Italic: "em",
    Underscored: "u",
    Strikethrough: "s",
    Keyboard: "code"
};

// Anytype's system colour palette (`--color-tag-*` / `--color-bg-tag-*`); marks carry the name in `param`.
// Backgrounds are already opaque, so no flatten-over-white step is needed (unlike Notion's translucent set).
const TEXT_COLORS: Record<string, string> = {
    grey: "#8c9ea5", yellow: "#b2a616", orange: "#d3720d", red: "#e2400c", pink: "#ca1b8e",
    purple: "#9e30c4", blue: "#3e58eb", ice: "#1c8bca", teal: "#0caaa3", lime: "#64b90f"
};
const BG_COLORS: Record<string, string> = {
    grey: "#e3e3e3", yellow: "#f4eb91", orange: "#fcdc9c", red: "#fcd1c3", pink: "#f8c2e5",
    purple: "#e8d0f1", blue: "#cbd2fa", ice: "#b2dff9", teal: "#a9ebe6", lime: "#c5efa3"
};

// Anytype's default (light-theme) text colour. A highlight (background) without an explicit text colour is
// paired with this so the text stays readable on the pale highlight regardless of the Trilium theme —
// otherwise a dark theme's default white text would be invisible on it.
const DEFAULT_TEXT_COLOR = "#252525";

// Outer-to-inner nesting order for the structural marks that cover the same segment — fixed so output is
// deterministic. Colours are handled separately (folded into a single inner span).
const MARK_ORDER = ["Bold", "Italic", "Underscored", "Strikethrough", "Keyboard"];

interface AppliedMark {
    type: string;
    param: string;
    from: number;
    to: number;
}

export function renderInlineText(text: string, marks: AnytypeMark[]): string {
    const length = text.length;

    // Keep only marks we render (known structural kind, or a known colour name), with offsets clamped to
    // the text and empty/reversed ranges dropped.
    const applicable: AppliedMark[] = [];
    for (const mark of marks) {
        const param = mark.param ?? "";
        if (mark.type === undefined || !isRenderable(mark.type, param)) {
            continue;
        }
        const from = Math.max(0, Math.min(length, mark.range?.from ?? 0));
        const to = Math.max(0, Math.min(length, mark.range?.to ?? 0));
        if (from < to) {
            applicable.push({ type: mark.type, param, from, to });
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
        const covering = applicable.filter((mark) => mark.from <= start && mark.to >= end);
        html += wrapSegment(escapeHtml(text.slice(start, end)), covering);
    }

    return html;
}

/** Whether a mark is rendered: a known structural kind, or a colour with a known palette name. */
function isRenderable(type: string, param: string): boolean {
    if (type in MARK_TAGS) {
        return true;
    }
    if (type === "TextColor") {
        return param in TEXT_COLORS;
    }
    if (type === "BackgroundColor") {
        return param in BG_COLORS;
    }
    return false;
}

/**
 * Wraps one segment in the tags of the marks that fully cover it. Text and background colour fold into a
 * single innermost `<span>` (a highlight without a text colour gets the default dark text); the structural
 * marks then nest around it, Bold outermost per {@link MARK_ORDER}.
 */
function wrapSegment(segment: string, covering: AppliedMark[]): string {
    const textColor = paletteValue(covering, "TextColor", TEXT_COLORS);
    const bgColor = paletteValue(covering, "BackgroundColor", BG_COLORS);

    const styleParts: string[] = [];
    if (textColor) {
        styleParts.push(`color:${textColor}`);
    } else if (bgColor) {
        styleParts.push(`color:${DEFAULT_TEXT_COLOR}`);
    }
    if (bgColor) {
        styleParts.push(`background-color:${bgColor}`);
    }
    let html = styleParts.length > 0 ? `<span style="${styleParts.join(";")}">${segment}</span>` : segment;

    const structural = covering.filter((mark) => mark.type in MARK_TAGS).sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
    for (let i = structural.length - 1; i >= 0; i--) {
        const tag = MARK_TAGS[structural[i].type];
        html = `<${tag}>${html}</${tag}>`;
    }

    return html;
}

/** The palette value for the segment's mark of the given colour type, or undefined if none covers it. */
function paletteValue(covering: AppliedMark[], type: string, palette: Record<string, string>): string | undefined {
    const mark = covering.find((candidate) => candidate.type === type);
    return mark ? palette[mark.param] : undefined;
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
