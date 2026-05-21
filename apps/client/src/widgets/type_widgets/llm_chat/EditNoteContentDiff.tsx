import "./EditNoteContentDiff.css";

import { t } from "../../../services/i18n.js";

/** A single find-and-replace edit performed by the `edit_note_content` tool. */
export interface NoteContentEdit {
    oldText: string;
    newText: string;
}

export type DiffLineType = "add" | "remove" | "context";

export interface DiffLine {
    type: DiffLineType;
    text: string;
}

/**
 * Compute a line-based diff between two text blocks using the classic
 * longest-common-subsequence algorithm. Returns the lines in display order,
 * each tagged as added, removed or unchanged context.
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
    const a = oldText.split("\n");
    const b = newText.split("\n");
    const m = a.length;
    const n = b.length;

    // dp[i][j] = length of the LCS of a[i:] and b[j:].
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j]
                ? dp[i + 1][j + 1] + 1
                : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }

    const result: DiffLine[] = [];
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
        if (a[i] === b[j]) {
            result.push({ type: "context", text: a[i] });
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            result.push({ type: "remove", text: a[i] });
            i++;
        } else {
            result.push({ type: "add", text: b[j] });
            j++;
        }
    }
    while (i < m) result.push({ type: "remove", text: a[i++] });
    while (j < n) result.push({ type: "add", text: b[j++] });
    return result;
}

const GUTTER_MARKER: Record<DiffLineType, string> = {
    add: "+",
    remove: "-",
    context: " "
};

/** Renders a single edit (one find/replace pair) as a unified diff hunk. */
function DiffHunk({ edit }: { edit: NoteContentEdit }) {
    const lines = diffLines(edit.oldText, edit.newText);
    return (
        <div className="llm-diff-hunk">
            {lines.map((line, idx) => (
                <div key={idx} className={`llm-diff-line llm-diff-line-${line.type}`}>
                    <span className="llm-diff-gutter">{GUTTER_MARKER[line.type]}</span>
                    <span className="llm-diff-text">{line.text || " "}</span>
                </div>
            ))}
        </div>
    );
}

/** Validate that an unknown value is a usable list of note-content edits. */
export function parseNoteContentEdits(value: unknown): NoteContentEdit[] | null {
    if (!Array.isArray(value) || value.length === 0) return null;
    const edits: NoteContentEdit[] = [];
    for (const item of value) {
        if (typeof item !== "object" || item === null) return null;
        const { oldText, newText } = item as Record<string, unknown>;
        if (typeof oldText !== "string" || typeof newText !== "string") return null;
        edits.push({ oldText, newText });
    }
    return edits;
}

/** A fancy unified diff for the `edit_note_content` tool's list of edits. */
export function EditNoteContentDiff({ edits }: { edits: NoteContentEdit[] }) {
    return (
        <div className="llm-diff">
            {edits.map((edit, idx) => (
                <div key={idx} className="llm-diff-edit">
                    {edits.length > 1 && (
                        <div className="llm-diff-edit-header">
                            {t("llm_chat.edit_index", { index: idx + 1, total: edits.length })}
                        </div>
                    )}
                    <DiffHunk edit={edit} />
                </div>
            ))}
        </div>
    );
}
