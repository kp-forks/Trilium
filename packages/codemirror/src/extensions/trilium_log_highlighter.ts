import { RangeSetBuilder, type Extension } from "@codemirror/state";
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
 *  - `<ts> JS Error: …` and `<ts> ERROR: …` lines — coloured red
 */

// Length of the leading `HH:MM:SS.mmm` timestamp.
const TIMESTAMP_LENGTH = 12;
const TIMESTAMP = /^\d{2}:\d{2}:\d{2}\.\d{3}/;
// After `<ts> `: a 3-digit status, a space, then a known HTTP verb. The fixed-width prefix lets us
// derive the status/verb offsets without a second scan.
const HTTP_REQUEST = /^\d{2}:\d{2}:\d{2}\.\d{3} (\d{3}) (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/;
const ERROR_LINE = /^\d{2}:\d{2}:\d{2}\.\d{3} (?:JS Error|ERROR):/;

const timestampMark = Decoration.mark({ class: "cm-log-timestamp" });
const verbMark = Decoration.mark({ class: "cm-log-verb" });
const httpLine = Decoration.line({ class: "cm-log-http" });
const errorLine = Decoration.line({ class: "cm-log-error" });
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
    ".cm-log-status": { fontWeight: "bold" },
    ".cm-log-status-2xx": { color: "var(--log-status-success-color, #2ea043)" },
    ".cm-log-status-3xx": { color: "var(--log-status-redirect-color, var(--muted-text-color))" },
    ".cm-log-status-4xx": { color: "var(--log-status-client-error-color, #d29922)" },
    ".cm-log-status-5xx": { color: "var(--log-status-server-error-color, #e5534b)" },
    ".cm-log-error": { color: "var(--log-error-color, #e5534b)" }
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

    for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
            const line = view.state.doc.lineAt(pos);
            decorateLine(builder, line.from, line.text);
            pos = line.to + 1;
        }
    }

    return builder.finish();
}

function decorateLine(builder: RangeSetBuilder<Decoration>, lineStart: number, text: string) {
    if (!TIMESTAMP.test(text)) {
        return; // continuation lines (e.g. wrapped stack traces) carry no timestamp
    }

    const httpMatch = HTTP_REQUEST.exec(text);
    // Line decorations must be added at the line start before any mark that begins there.
    if (httpMatch) {
        builder.add(lineStart, lineStart, httpLine);
    } else if (ERROR_LINE.test(text)) {
        builder.add(lineStart, lineStart, errorLine);
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
    }
}
