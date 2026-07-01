import { RangeSetBuilder, type Extension, type Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

/**
 * Lightweight regex highlighter for the Trilium backend log. Each log entry is a single line
 * beginning with a `HH:MM:SS.mmm` timestamp; decorations are computed only over the visible
 * viewport, so this stays cheap even on very large logs (and is unaffected by `preferPerformance`,
 * which only disables the language-mode syntax highlighting).
 *
 * Recognised entries:
 *  - the leading timestamp (muted, on every entry)
 *  - HTTP request lines `<ts> <status> <VERB> …` — the whole line is tinted, the verb bolded and
 *    the status colour-coded by class (2xx/3xx/4xx/5xx)
 *  - `<ts> JS Error: …` and `<ts> ERROR: …` lines — coloured red, together with their following
 *    continuation lines (e.g. wrapped stack traces), which carry no timestamp of their own
 *  - `<ts> JS Info: …` lines (and their continuation lines) — placeholder class, no colour yet
 */

// Length of the leading `HH:MM:SS.mmm` timestamp.
const TIMESTAMP_LENGTH = 12;
const TIMESTAMP = /^\d{2}:\d{2}:\d{2}\.\d{3}/;
// After `<ts> `: a 3-digit status, a space, a known HTTP verb, a space, then the request URL (a
// single whitespace-free token). The fixed-width prefix lets us derive the offsets without a rescan.
const HTTP_REQUEST = /^\d{2}:\d{2}:\d{2}\.\d{3} (\d{3}) (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) (\S+)/;
const ERROR_LINE = /^\d{2}:\d{2}:\d{2}\.\d{3} (?:JS Error|ERROR):/;
const INFO_LINE = /^\d{2}:\d{2}:\d{2}\.\d{3} JS Info:/;

const timestampMark = Decoration.mark({ class: "cm-log-timestamp" });
const verbMark = Decoration.mark({ class: "cm-log-verb" });
const urlMark = Decoration.mark({ class: "cm-log-url" });
const httpLine = Decoration.line({ class: "cm-log-http" });
const errorLine = Decoration.line({ class: "cm-log-error" });
const infoLine = Decoration.line({ class: "cm-log-info" });
const statusMarks: Record<string, Decoration> = {
    "2": Decoration.mark({ class: "cm-log-status cm-log-status-2xx" }),
    "3": Decoration.mark({ class: "cm-log-status cm-log-status-3xx" }),
    "4": Decoration.mark({ class: "cm-log-status cm-log-status-4xx" }),
    "5": Decoration.mark({ class: "cm-log-status cm-log-status-5xx" })
};

const logHighlightTheme = EditorView.baseTheme({
    ".cm-log-timestamp": { color: "var(--muted-text-color)" },
    ".cm-log-http": { backgroundColor: "var(--log-http-line-background-color, color-mix(in srgb, var(--main-text-color) 3%, transparent))" },
    ".cm-log-verb": { fontWeight: "bold", color: "var(--log-http-verb-color, #539bf5)" },
    ".cm-log-url": { color: "var(--log-http-url-color, #268a8a)" },
    ".cm-log-status": { fontWeight: "bold" },
    ".cm-log-status-2xx": { color: "var(--log-status-success-color, #2ea043)" },
    ".cm-log-status-3xx": { color: "var(--log-status-redirect-color, var(--muted-text-color))" },
    ".cm-log-status-4xx": { color: "var(--log-status-client-error-color, #d29922)" },
    ".cm-log-status-5xx": { color: "var(--log-status-server-error-color, #e5534b)" },
    ".cm-log-error": { color: "var(--log-error-color, #e5534b)" },
    // Placeholder: no colour yet — set `--log-info-color` to activate.
    ".cm-log-info": { color: "var(--log-info-color, inherit)" }
});

const logHighlightPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
        this.decorations = buildLogDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = buildLogDecorations(update.view);
        }
    }
}, {
    decorations: (plugin) => plugin.decorations
});

/** The extension to register on the backend-log editor (e.g. via `setNamedExtension`). */
export const triliumLogHighlighter: Extension = [ logHighlightPlugin, logHighlightTheme ];

function buildLogDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc;

    for (const { from, to } of view.visibleRanges) {
        // Continuation lines belong to the nearest preceding timestamped line, which may be
        // scrolled above the viewport — seed the state by scanning backwards from the top line.
        let blockLine = blockLineAtStart(doc, doc.lineAt(from).number);
        let pos = from;
        while (pos <= to) {
            const line = doc.lineAt(pos);
            blockLine = decorateLine(builder, line, blockLine);
            pos = line.to + 1;
        }
    }

    return builder.finish();
}

/**
 * Returns the line decoration a multi-line block entry applies to itself and its continuation lines
 * (e.g. `errorLine` for `JS Error:`/`ERROR:`, `infoLine` for `JS Info:`), or null for entries that
 * don't span lines. `null` for continuation lines, which carry no timestamp.
 */
function blockLineFor(text: string): Decoration | null {
    if (ERROR_LINE.test(text)) return errorLine;
    if (INFO_LINE.test(text)) return infoLine;
    return null;
}

/**
 * Decorates a single line and returns the block decoration in effect for the following
 * (continuation) lines. A timestamped line opens a block (or closes any open one); a line without a
 * timestamp inherits the incoming `blockLine`.
 */
function decorateLine(builder: RangeSetBuilder<Decoration>, line: { from: number; text: string }, blockLine: Decoration | null): Decoration | null {
    const { from: lineStart, text } = line;

    if (!TIMESTAMP.test(text)) {
        // Continuation line (e.g. a wrapped stack trace): inherit the current block's colour.
        if (blockLine) {
            builder.add(lineStart, lineStart, blockLine);
        }
        return blockLine;
    }

    const httpMatch = HTTP_REQUEST.exec(text);
    const newBlockLine = httpMatch ? null : blockLineFor(text);
    // Line decorations must be added at the line start before any mark that begins there.
    if (httpMatch) {
        builder.add(lineStart, lineStart, httpLine);
    } else if (newBlockLine) {
        builder.add(lineStart, lineStart, newBlockLine);
    }

    builder.add(lineStart, lineStart + TIMESTAMP_LENGTH, timestampMark);

    if (httpMatch) {
        // Fixed layout: `<12-char ts><space><3-char status><space><verb>`.
        const statusStart = lineStart + TIMESTAMP_LENGTH + 1;
        const verbStart = statusStart + 4;
        const statusMark = statusMarks[httpMatch[1][0]];
        if (statusMark) {
            builder.add(statusStart, statusStart + 3, statusMark);
        }
        builder.add(verbStart, verbStart + httpMatch[2].length, verbMark);
        const urlStart = verbStart + httpMatch[2].length + 1;
        builder.add(urlStart, urlStart + httpMatch[3].length, urlMark);
    }

    return newBlockLine;
}

/**
 * Walks backwards from the line above `lineNumber` to the nearest timestamped line and returns the
 * block decoration `lineNumber` starts inside (or null). The scan is capped so a pathologically long
 * block near the top of the viewport can't stall rendering.
 */
function blockLineAtStart(doc: Text, lineNumber: number): Decoration | null {
    const MAX_SCAN = 1000;
    for (let n = lineNumber - 1, steps = 0; n >= 1 && steps < MAX_SCAN; n--, steps++) {
        const text = doc.line(n).text;
        if (TIMESTAMP.test(text)) {
            return blockLineFor(text);
        }
    }
    return null;
}
