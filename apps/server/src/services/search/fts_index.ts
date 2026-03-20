"use strict";

import sql from "../sql.js";
import log from "../log.js";
import protectedSessionService from "../protected_session.js";
import preprocessContent from "./expressions/note_content_fulltext_preprocessor.js";

interface ContentRow {
    noteId: string;
    type: string;
    mime: string;
    content: string | Buffer | null;
    isProtected: number;
    isDeleted: number;
}

const MAX_CONTENT_SIZE = 2 * 1024 * 1024;

let indexBuilt = false;

function prepareContent(row: ContentRow): string | null {
    if (!row.content) return null;
    if (row.isDeleted) return null;

    let content: string | undefined;

    if (row.isProtected) {
        if (!protectedSessionService.isProtectedSessionAvailable()) {
            return null;
        }
        try {
            content = protectedSessionService.decryptString(row.content as string) || undefined;
        } catch {
            return null;
        }
    } else {
        content = typeof row.content === "string" ? row.content : row.content.toString();
    }

    if (!content || content.length > MAX_CONTENT_SIZE) return null;

    try {
        content = preprocessContent(content, row.type, row.mime);
    } catch {
        return null;
    }

    return content || null;
}

function ftsTableExists(): boolean {
    try {
        const result = sql.getValue<number>(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='note_content_fts'"
        );
        return result > 0;
    } catch {
        return false;
    }
}

function buildIndex(): void {
    if (!ftsTableExists()) {
        log.info("FTS5 table does not exist, skipping index build.");
        return;
    }

    const startTime = Date.now();
    log.info("Building FTS content index...");

    sql.execute("DELETE FROM note_content_fts");

    // Collect all rows first, then batch-insert in a transaction.
    // iterateRows() holds an open cursor that conflicts with writes on the same connection.
    const prepared: { noteId: string; content: string }[] = [];

    for (const row of sql.iterateRows<ContentRow>(`
        SELECT noteId, type, mime, content, isProtected, isDeleted
        FROM notes JOIN blobs USING (blobId)
        WHERE type IN ('text', 'code', 'mermaid', 'canvas', 'mindMap')
          AND isDeleted = 0
          AND content IS NOT NULL
          AND LENGTH(content) < ${MAX_CONTENT_SIZE}
    `)) {
        const processedContent = prepareContent(row);
        if (processedContent) {
            prepared.push({ noteId: row.noteId, content: processedContent });
        }
    }

    const count = sql.transactional(() => {
        for (const { noteId, content } of prepared) {
            sql.execute(
                "INSERT INTO note_content_fts (noteId, content) VALUES (?, ?)",
                [noteId, content]
            );
        }
        return prepared.length;
    });

    const elapsed = Date.now() - startTime;
    log.info(`FTS content index built: ${count} notes indexed in ${elapsed}ms`);
    indexBuilt = true;
}

function updateNote(noteId: string): void {
    if (!indexBuilt || !ftsTableExists()) return;

    sql.execute("DELETE FROM note_content_fts WHERE noteId = ?", [noteId]);

    const row = sql.getRowOrNull<ContentRow>(`
        SELECT noteId, type, mime, content, isProtected, isDeleted
        FROM notes JOIN blobs USING (blobId)
        WHERE noteId = ?
    `, [noteId]);

    if (!row) return;

    const processedContent = prepareContent(row);
    if (processedContent) {
        sql.execute(
            "INSERT INTO note_content_fts (noteId, content) VALUES (?, ?)",
            [row.noteId, processedContent]
        );
    }
}

function removeNote(noteId: string): void {
    if (!indexBuilt || !ftsTableExists()) return;
    sql.execute("DELETE FROM note_content_fts WHERE noteId = ?", [noteId]);
}

function searchContent(tokens: string[], operator: string = "*=*"): string[] {
    if (!ftsTableExists()) return [];

    if (!indexBuilt) {
        buildIndex();
    }

    const escapedTokens = tokens.map(t => {
        const cleaned = t.replace(/["*^(){}:]/g, "");
        if (!cleaned) return null;
        return `"${cleaned}"`;
    }).filter(Boolean);

    if (escapedTokens.length === 0) return [];

    let ftsQuery: string;
    if (operator === "=") {
        ftsQuery = escapedTokens.join(" ");
    } else {
        ftsQuery = escapedTokens.join(" AND ");
    }

    try {
        const results = sql.getColumn<string>(
            "SELECT noteId FROM note_content_fts WHERE note_content_fts MATCH ? ORDER BY rank",
            [ftsQuery]
        );
        return results;
    } catch (e) {
        log.info(`FTS5 query failed for "${ftsQuery}": ${e}`);
        return [];
    }
}

function isIndexBuilt(): boolean {
    return indexBuilt;
}

function resetIndex(): void {
    indexBuilt = false;
}

export default {
    buildIndex,
    updateNote,
    removeNote,
    searchContent,
    isIndexBuilt,
    resetIndex
};
