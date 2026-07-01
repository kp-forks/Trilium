import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { triliumLogHighlighter } from "./trilium_log_highlighter.js";

interface DecorationSpan {
    from: number;
    to: number;
    class: string;
}

describe("triliumLogHighlighter", () => {
    it("applies decorations the instant it enters the config (no edit/scroll needed)", () => {
        // Mirrors switching a code note's MIME to text/x-trilium-log: the highlighter is added to an
        // already-built editor state via a compartment reconfigure. Because it is a StateField, the
        // decorations must be present in the resulting state synchronously — a view plugin would not
        // paint until the next update.
        const compartment = new Compartment();
        const doc = "18:09:46.317 304 GET /api/notes/x/blob with 9911 bytes took 1ms";
        const before = EditorState.create({ doc, extensions: [ compartment.of([]) ] });
        expect(decorationsOf(before)).toHaveLength(0);

        const after = before.update({ effects: compartment.reconfigure(triliumLogHighlighter) }).state;
        expect(decorationsOf(after).length).toBeGreaterThan(0);
    });

    it("highlights an HTTP request line: timestamp, status class, verb and URL", () => {
        const doc = "18:09:46.317 304 GET /api/notes/x/blob with 9911 bytes took 1ms";
        const classes = classesOf(doc);

        expect(classes).toContain("cm-log-http"); // whole-line tint
        expect(classes).toContain("cm-log-timestamp");
        expect(classes).toContain("cm-log-status cm-log-status-3xx");
        expect(classes).toContain("cm-log-verb");
        expect(classes).toContain("cm-log-url");

        // The URL span covers exactly `/api/notes/x/blob`.
        const url = decorationsOf(state(doc)).find((d) => d.class === "cm-log-url");
        expect(url && doc.slice(url.from, url.to)).toBe("/api/notes/x/blob");
    });

    it("colours the status by class family", () => {
        expect(classesOf("18:18:38.904 204 PUT /api/options with 0 bytes took 2ms"))
            .toContain("cm-log-status cm-log-status-2xx");
        expect(classesOf("18:18:38.904 503 GET /api/x with 0 bytes took 2ms"))
            .toContain("cm-log-status cm-log-status-5xx");
    });

    it("colours an error line and its timestamp-less continuation lines", () => {
        const doc = [
            "17:34:08.519 JS Error: Uncaught error: boom",
            "    at foo (bar.ts:1:2)",
            "    at baz (qux.ts:3:4)",
            "18:46:03.781 304 GET /api/options with 359 bytes took 4ms"
        ].join("\n");
        const errorLines = decorationsOf(state(doc)).filter((d) => d.class === "cm-log-error");

        // The header line plus its two continuation lines are all decorated; the following HTTP
        // request line is not.
        const lineStarts = errorLines.filter((d) => d.from === d.to).map((d) => d.from);
        expect(lineStarts).toHaveLength(3);
        expect(classesOf(doc)).toContain("cm-log-http");
    });

    it("recognises JS Info lines and leaves plain lines with only a timestamp", () => {
        expect(classesOf("17:34:08.519 JS Info: something happened")).toContain("cm-log-info");

        const plain = classesOf("18:18:40.077 Slow query took 78ms: SELECT 1");
        expect(plain).toEqual([ "cm-log-timestamp" ]);
    });
});

function state(doc: string): EditorState {
    return EditorState.create({ doc, extensions: [ triliumLogHighlighter ] });
}

/** All decoration ranges contributed to the view's decoration facet, in document order. */
function decorationsOf(editorState: EditorState): DecorationSpan[] {
    const spans: DecorationSpan[] = [];
    for (const set of editorState.facet(EditorView.decorations)) {
        if (typeof set === "function") continue; // plugin-provided sources (none here)
        const iter = set.iter();
        while (iter.value) {
            spans.push({ from: iter.from, to: iter.to, class: iter.value.spec.class });
            iter.next();
        }
    }
    return spans;
}

function classesOf(doc: string): string[] {
    return decorationsOf(state(doc)).map((d) => d.class);
}
