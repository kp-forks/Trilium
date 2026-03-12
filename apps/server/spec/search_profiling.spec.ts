/**
 * Integration-level search profiling test.
 *
 * Uses the real SQLite database (spec/db/document.db loaded in-memory),
 * real sql module, real becca cache, and the full app stack.
 *
 * Seeds a large number of notes via direct SQL (much faster than ETAPI)
 * to create a realistic dataset for profiling.
 */
import { Application } from "express";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../src/services/config.js";

let app: Application;

function timed<T>(fn: () => T): [T, number] {
    const start = performance.now();
    const result = fn();
    return [result, performance.now() - start];
}

function randomId(len = 12): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let id = "";
    for (let i = 0; i < len; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
}

function randomWord(len = 8): string {
    const chars = "abcdefghijklmnopqrstuvwxyz";
    let w = "";
    for (let i = 0; i < len; i++) w += chars[Math.floor(Math.random() * chars.length)];
    return w;
}

function generateContent(wordCount: number, keyword?: string): string {
    const paragraphs: string[] = [];
    let remaining = wordCount;
    let injected = false;
    while (remaining > 0) {
        const n = Math.min(remaining, 30 + Math.floor(Math.random() * 30));
        const words: string[] = [];
        for (let i = 0; i < n; i++) words.push(randomWord(3 + Math.floor(Math.random() * 10)));
        if (keyword && !injected && remaining < wordCount / 2) {
            words[Math.floor(words.length / 2)] = keyword;
            injected = true;
        }
        paragraphs.push(`<p>${words.join(" ")}</p>`);
        remaining -= n;
    }
    return paragraphs.join("\n");
}

describe("Search profiling (integration)", () => {
    beforeAll(async () => {
        config.General.noAuthentication = true;
        const buildApp = (await import("../src/app.js")).default;
        app = await buildApp();
    });

    it("seed and profile with realistic data", async () => {
        const sql = (await import("../src/services/sql.js")).default;
        const becca = (await import("../src/becca/becca.js")).default;
        const beccaLoader = (await import("../src/becca/becca_loader.js")).default;
        const cls = (await import("../src/services/cls.js")).default;
        const searchService = (await import("../src/services/search/services/search.js")).default;
        const SearchContext = (await import("../src/services/search/search_context.js")).default;

        await new Promise<void>((resolve) => {
            cls.init(() => {
                const initialNoteCount = Object.keys(becca.notes).length;
                console.log(`\n  Initial becca notes: ${initialNoteCount}`);

                const configs = [
                    { notes: 2000, words: 500,  label: "2K notes × 500 words (~4KB)" },
                    { notes: 2000, words: 2000, label: "2K notes × 2000 words (~15KB)" },
                    { notes: 5000, words: 500,  label: "5K notes × 500 words (~4KB)" },
                    { notes: 5000, words: 2000, label: "5K notes × 2000 words (~15KB)" },
                    { notes: 10000, words: 1000, label: "10K notes × 1000 words (~8KB)" },
                ];

                for (const cfg of configs) {
                    // Reset DB: delete all seeded notes from prior iteration
                    sql.execute(`DELETE FROM blobs WHERE blobId LIKE 'seed%'`);
                    sql.execute(`DELETE FROM notes WHERE noteId LIKE 'seed%'`);
                    sql.execute(`DELETE FROM branches WHERE branchId LIKE 'seed%'`);

                    const TOTAL_NOTES = cfg.notes;
                    const MATCH_FRACTION = 0.15;
                    const CONTENT_WORDS = cfg.words;
                    const matchCount = Math.floor(TOTAL_NOTES * MATCH_FRACTION);

                    const now = new Date().toISOString().replace("T", " ").replace("Z", "+0000");

                    console.log(`\n  ──── ${cfg.label} ────`);
                    console.log(`  Seeding ${TOTAL_NOTES} notes (${matchCount} with keyword)...`);

                    const [, seedMs] = timed(() => {
                        sql.transactional(() => {
                            for (let i = 0; i < TOTAL_NOTES; i++) {
                                const isMatch = i < matchCount;
                                const noteId = `seed${randomId(8)}`;
                                const branchId = `seed${randomId(8)}`;
                                const blobId = `seed${randomId(16)}`;
                                const title = isMatch
                                    ? `Performance Doc ${i} ${randomWord(6)}`
                                    : `General Note ${i} ${randomWord(6)} ${randomWord(5)}`;
                                const content = generateContent(
                                    CONTENT_WORDS,
                                    isMatch ? "performance" : undefined
                                );

                                sql.execute(
                                    `INSERT INTO blobs (blobId, content, dateModified, utcDateModified)
                                     VALUES (?, ?, ?, ?)`,
                                    [blobId, content, now, now]
                                );

                                sql.execute(
                                    `INSERT INTO notes (noteId, title, type, mime, blobId, isProtected, isDeleted,
                                        dateCreated, dateModified, utcDateCreated, utcDateModified)
                                     VALUES (?, ?, 'text', 'text/html', ?, 0, 0, ?, ?, ?, ?)`,
                                    [noteId, title, blobId, now, now, now, now]
                                );

                                sql.execute(
                                    `INSERT INTO branches (branchId, noteId, parentNoteId, notePosition, isDeleted, isExpanded,
                                        utcDateModified)
                                     VALUES (?, ?, 'root', ?, 0, 0, ?)`,
                                    [branchId, noteId, i * 10, now]
                                );
                            }
                        });
                    });
                    console.log(`  SQL seeding: ${seedMs.toFixed(0)}ms`);

                    // Reload becca to pick up new notes
                    const [, reloadMs] = timed(() => {
                        beccaLoader.load();
                    });
                    console.log(`  Becca reload: ${reloadMs.toFixed(0)}ms`);
                    console.log(`  Becca notes after seed: ${Object.keys(becca.notes).length}`);

                    // Verify content is accessible
                    const sampleNote = Object.values(becca.notes).find(n => n.title.startsWith("Performance Doc"));
                    if (sampleNote) {
                        const content = sampleNote.getContent();
                        console.log(`  Sample content length: ${typeof content === 'string' ? content.length : 0} chars`);
                    }

                    // ==========================================
                    // PROFILING
                    // ==========================================

                    console.log(`\n  --- PROFILING (${cfg.label}) ---\n`);

                    // --- 1. Fast search (NoteFlatTextExp only) ---
                    searchService.findResultsWithQuery("performance", new SearchContext({ fastSearch: true }));

                    const fastTimes: number[] = [];
                    let fastResultCount = 0;
                    for (let i = 0; i < 5; i++) {
                        const [r, ms] = timed(() =>
                            searchService.findResultsWithQuery("performance",
                                new SearchContext({ fastSearch: true })
                            )
                        );
                        fastTimes.push(ms);
                        fastResultCount = r.length;
                    }
                    const fastAvg = fastTimes.reduce((a, b) => a + b, 0) / fastTimes.length;
                    console.log(`  Fast search (flat text only):     avg ${fastAvg.toFixed(1)}ms  (${fastResultCount} results)`);

                    // --- 2. Full search (flat text + content fulltext via SQL) ---
                    const fullTimes: number[] = [];
                    let fullResultCount = 0;
                    for (let i = 0; i < 3; i++) {
                        const [r, ms] = timed(() =>
                            searchService.findResultsWithQuery("performance",
                                new SearchContext({ fastSearch: false })
                            )
                        );
                        fullTimes.push(ms);
                        fullResultCount = r.length;
                    }
                    const fullAvg = fullTimes.reduce((a, b) => a + b, 0) / fullTimes.length;
                    console.log(`  Full search (flat + SQL content): avg ${fullAvg.toFixed(1)}ms  (${fullResultCount} results)`);

                    // --- 3. Content snippet extraction ---
                    const fastResults = searchService.findResultsWithQuery("performance",
                        new SearchContext({ fastSearch: true }));
                    const trimmed = fastResults.slice(0, 200);
                    const tokens = ["performance"];

                    const snippetTimes: number[] = [];
                    for (let i = 0; i < 3; i++) {
                        const [, ms] = timed(() => {
                            for (const r of trimmed) {
                                r.contentSnippet = searchService.extractContentSnippet(r.noteId, tokens);
                            }
                        });
                        snippetTimes.push(ms);
                    }
                    const snippetAvg = snippetTimes.reduce((a, b) => a + b, 0) / snippetTimes.length;
                    console.log(`  Content snippet (${trimmed.length} results):   avg ${snippetAvg.toFixed(1)}ms  (${(snippetAvg / trimmed.length).toFixed(3)}ms/note)`);

                    // --- 4. Raw getContent() cost ---
                    const contentTimes: number[] = [];
                    const textNotes = trimmed
                        .map(r => becca.notes[r.noteId])
                        .filter(n => n && ["text", "code"].includes(n.type));

                    for (let i = 0; i < 5; i++) {
                        const [, ms] = timed(() => {
                            for (const n of textNotes) n.getContent();
                        });
                        contentTimes.push(ms);
                    }
                    const contentAvg = contentTimes.reduce((a, b) => a + b, 0) / contentTimes.length;
                    console.log(`  getContent() × ${textNotes.length} notes:      avg ${contentAvg.toFixed(1)}ms  (${(contentAvg / textNotes.length).toFixed(3)}ms/note)`);

                    // --- 5. striptags + normalize cost (isolated) ---
                    const striptags = require("striptags");
                    const normalizeString = require("normalize-strings");
                    const contents = textNotes.map(n => n.getContent() as string).filter(Boolean);

                    const [, stripMs] = timed(() => {
                        for (const c of contents) {
                            striptags(c);
                        }
                    });
                    console.log(`  striptags × ${contents.length} notes:       ${stripMs.toFixed(1)}ms  (${(stripMs / contents.length).toFixed(3)}ms/note)`);

                    const stripped = contents.map(c => striptags(c));
                    const [, normMs] = timed(() => {
                        for (const s of stripped) {
                            normalizeString(s.toLowerCase());
                        }
                    });
                    console.log(`  normalizeString × ${stripped.length} notes:  ${normMs.toFixed(1)}ms  (${(normMs / stripped.length).toFixed(3)}ms/note)`);

                    // --- 6. Full autocomplete ---
                    const autoTimes: number[] = [];
                    let autoResultCount = 0;
                    for (let i = 0; i < 3; i++) {
                        const [r, ms] = timed(() =>
                            searchService.searchNotesForAutocomplete("performance", true)
                        );
                        autoTimes.push(ms);
                        autoResultCount = r.length;
                    }
                    const autoAvg = autoTimes.reduce((a, b) => a + b, 0) / autoTimes.length;
                    console.log(`\n  FULL AUTOCOMPLETE:                avg ${autoAvg.toFixed(1)}ms  (${autoResultCount} results)`);

                    // --- 7. SQL content scan cost ---
                    const [scanCount, scanMs] = timed(() => {
                        let count = 0;
                        for (const row of sql.iterateRows<{ content: Buffer | string }>(`
                            SELECT noteId, type, mime, content, isProtected
                            FROM notes JOIN blobs USING (blobId)
                            WHERE type IN ('text', 'code', 'mermaid', 'canvas', 'mindMap')
                              AND isDeleted = 0
                              AND LENGTH(content) < 2097152`)) {
                            count++;
                        }
                        return count;
                    });
                    console.log(`  SQL content scan (${scanCount} rows):    ${scanMs.toFixed(1)}ms`);

                    // --- Summary ---
                    console.log(`\n  === SUMMARY (${cfg.label}, ${Object.keys(becca.notes).length} total notes) ===`);
                    console.log(`  Fast search:          ${fastAvg.toFixed(1)}ms`);
                    console.log(`  Full search:          ${fullAvg.toFixed(1)}ms`);
                    console.log(`  Content snippets:     ${snippetAvg.toFixed(1)}ms (${(snippetAvg / trimmed.length).toFixed(3)}ms/note)`);
                    console.log(`  normalizeString:      ${normMs.toFixed(1)}ms (${(normMs / stripped.length).toFixed(3)}ms/note)`);
                    console.log(`  Full autocomplete:    ${autoAvg.toFixed(1)}ms`);
                    console.log(`  SQL scan:             ${scanMs.toFixed(1)}ms (${scanCount} rows)`);
                }

                resolve();
            });
        });
    }, 600_000);
});
