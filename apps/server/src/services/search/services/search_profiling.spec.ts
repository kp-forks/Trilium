/**
 * Search performance profiling tests.
 *
 * These tests measure where time is spent in the search pipeline.
 * We monkeypatch note.getContent() to return synthetic HTML content
 * since unit tests don't have a real SQLite database.
 *
 * KNOWN GAPS vs production:
 * - note.getContent() is instant (monkeypatched) vs ~2ms SQL fetch
 * - NoteContentFulltextExp.execute() is skipped (no sql.iterateRows)
 *   because fastSearch=true uses only NoteFlatTextExp
 * - These tests focus on the in-memory/CPU-bound parts of the pipeline
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import searchService from "./search.js";
import BNote from "../../../becca/entities/bnote.js";
import BBranch from "../../../becca/entities/bbranch.js";
import SearchContext from "../search_context.js";
import becca from "../../../becca/becca.js";
import beccaService from "../../../becca/becca_service.js";
import { NoteBuilder, note, id } from "../../../test/becca_mocking.js";
import SearchResult from "../search_result.js";
import { normalizeSearchText } from "../utils/text_utils.js";

// ── helpers ──────────────────────────────────────────────────────────

function randomWord(len = 6): string {
    const chars = "abcdefghijklmnopqrstuvwxyz";
    let word = "";
    for (let i = 0; i < len; i++) {
        word += chars[Math.floor(Math.random() * chars.length)];
    }
    return word;
}

function generateHtmlContent(wordCount: number, includeTarget = false): string {
    const paragraphs: string[] = [];
    let wordsRemaining = wordCount;

    while (wordsRemaining > 0) {
        const paraWords = Math.min(wordsRemaining, 20 + Math.floor(Math.random() * 40));
        const words: string[] = [];
        for (let i = 0; i < paraWords; i++) {
            words.push(randomWord(3 + Math.floor(Math.random() * 10)));
        }
        if (includeTarget && paragraphs.length === 2) {
            words[Math.floor(words.length / 2)] = "target";
        }
        paragraphs.push(`<p>${words.join(" ")}</p>`);
        wordsRemaining -= paraWords;
    }

    return `<html><body>${paragraphs.join("\n")}</body></html>`;
}

function timed<T>(fn: () => T): [T, number] {
    const start = performance.now();
    const result = fn();
    return [result, performance.now() - start];
}

interface TimingEntry { label: string; ms: number; }

function reportTimings(title: string, timings: TimingEntry[]) {
    const total = timings.reduce((s, t) => s + t.ms, 0);
    console.log(`\n=== ${title} (total: ${total.toFixed(1)}ms) ===`);
    for (const { label, ms } of timings) {
        const pct = total > 0 ? ((ms / total) * 100).toFixed(0) : "0";
        const bar = "#".repeat(Math.max(1, Math.round(ms / total * 40)));
        console.log(`  ${label.padEnd(55)} ${ms.toFixed(1).padStart(8)}ms  ${pct.padStart(3)}%  ${bar}`);
    }
}

// ── dataset builder ──────────────────────────────────────────────────

const syntheticContent: Record<string, string> = {};

function buildDataset(noteCount: number, opts: {
    matchFraction?: number;
    labelsPerNote?: number;
    depth?: number;
    contentWordCount?: number;
} = {}) {
    const {
        matchFraction = 0.1,
        labelsPerNote = 3,
        depth = 3,
        contentWordCount = 200,
    } = opts;

    becca.reset();
    for (const key of Object.keys(syntheticContent)) {
        delete syntheticContent[key];
    }

    const rootNote = new NoteBuilder(new BNote({ noteId: "root", title: "root", type: "text" }));
    new BBranch({
        branchId: "none_root",
        noteId: "root",
        parentNoteId: "none",
        notePosition: 10
    });

    const containers: NoteBuilder[] = [];
    let parent = rootNote;
    for (let d = 0; d < depth; d++) {
        const container = note(`Container_${d}_${randomWord(4)}`);
        parent.child(container);
        containers.push(container);
        parent = container;
    }

    const matchCount = Math.floor(noteCount * matchFraction);

    for (let i = 0; i < noteCount; i++) {
        const isMatch = i < matchCount;
        const title = isMatch
            ? `${randomWord(5)} target ${randomWord(5)} Document ${i}`
            : `${randomWord(5)} ${randomWord(6)} ${randomWord(4)} Note ${i}`;

        const n = note(title);

        for (let l = 0; l < labelsPerNote; l++) {
            const labelName = isMatch && l === 0 ? "category" : `label_${randomWord(4)}`;
            const labelValue = isMatch && l === 0 ? "important target" : randomWord(8);
            n.label(labelName, labelValue);
        }

        syntheticContent[n.note.noteId] = generateHtmlContent(contentWordCount, isMatch);

        const containerIndex = i % containers.length;
        containers[containerIndex].child(n);
    }

    // Monkeypatch getContent()
    for (const noteObj of Object.values(becca.notes)) {
        const noteId = noteObj.noteId;
        if (syntheticContent[noteId]) {
            (noteObj as any).getContent = () => syntheticContent[noteId];
        } else {
            (noteObj as any).getContent = () => "";
        }
    }

    return { rootNote, matchCount };
}

// ── profiling tests ──────────────────────────────────────────────────

describe("Search Profiling", () => {

    afterEach(() => {
        becca.reset();
    });

    /**
     * Break down the autocomplete pipeline into every individual stage,
     * including previously unmeasured operations like getBestNotePath,
     * SearchResult construction, and getNoteTitleForPath.
     */
    describe("Granular autocomplete pipeline", () => {

        for (const noteCount of [500, 2000, 5000, 10000]) {
            it(`granular breakdown with ${noteCount} notes`, () => {
                const timings: TimingEntry[] = [];

                const [, buildMs] = timed(() => buildDataset(noteCount, {
                    matchFraction: 0.2,
                    contentWordCount: 300,
                    depth: 5
                }));
                timings.push({ label: `Dataset build (${noteCount} notes)`, ms: buildMs });

                // === NoteFlatTextExp: getCandidateNotes ===
                // This calls getFlatText() + normalizeSearchText() for EVERY note
                const allNotes = Object.values(becca.notes);
                for (const n of allNotes) n.invalidateThisCache();

                const [, candidateMs] = timed(() => {
                    const token = normalizeSearchText("target");
                    let count = 0;
                    for (const n of allNotes) {
                        const flatText = normalizeSearchText(n.getFlatText());
                        if (flatText.includes(token)) count++;
                    }
                    return count;
                });
                timings.push({ label: `getCandidateNotes simulation (cold caches)`, ms: candidateMs });

                // Warm cache version
                const [candidateCount, candidateWarmMs] = timed(() => {
                    const token = normalizeSearchText("target");
                    let count = 0;
                    for (const n of allNotes) {
                        const flatText = normalizeSearchText(n.getFlatText());
                        if (flatText.includes(token)) count++;
                    }
                    return count;
                });
                timings.push({ label: `getCandidateNotes simulation (warm caches)`, ms: candidateWarmMs });

                // === getBestNotePath for each candidate ===
                const candidates = allNotes.filter(n => {
                    const flatText = normalizeSearchText(n.getFlatText());
                    return flatText.includes("target");
                });

                const [, pathMs] = timed(() => {
                    for (const n of candidates) {
                        n.getBestNotePath();
                    }
                });
                timings.push({ label: `getBestNotePath (${candidates.length} notes)`, ms: pathMs });

                // === SearchResult construction (includes getNoteTitleForPath) ===
                const paths = candidates.map(n => n.getBestNotePath()).filter(Boolean);

                const [searchResults, srMs] = timed(() => {
                    return paths.map(p => new SearchResult(p));
                });
                timings.push({ label: `SearchResult construction (${paths.length} results)`, ms: srMs });

                // === computeScore ===
                const [, scoreMs] = timed(() => {
                    for (const r of searchResults) {
                        r.computeScore("target", ["target"], true);
                    }
                });
                timings.push({ label: `computeScore with fuzzy (${searchResults.length} results)`, ms: scoreMs });

                const [, scoreNoFuzzyMs] = timed(() => {
                    for (const r of searchResults) {
                        r.computeScore("target", ["target"], false);
                    }
                });
                timings.push({ label: `computeScore no-fuzzy`, ms: scoreNoFuzzyMs });

                // === Sorting ===
                const [, sortMs] = timed(() => {
                    searchResults.sort((a, b) => {
                        if (a.score !== b.score) return b.score - a.score;
                        if (a.notePathArray.length === b.notePathArray.length) {
                            return a.notePathTitle < b.notePathTitle ? -1 : 1;
                        }
                        return a.notePathArray.length - b.notePathArray.length;
                    });
                });
                timings.push({ label: `Sort results`, ms: sortMs });

                // === Trim + content snippet extraction ===
                const trimmed = searchResults.slice(0, 200);

                const [, snippetMs] = timed(() => {
                    for (const r of trimmed) {
                        r.contentSnippet = searchService.extractContentSnippet(
                            r.noteId, ["target"]
                        );
                    }
                });
                timings.push({ label: `Content snippet extraction (${trimmed.length} results)`, ms: snippetMs });

                const [, attrMs] = timed(() => {
                    for (const r of trimmed) {
                        r.attributeSnippet = searchService.extractAttributeSnippet(
                            r.noteId, ["target"]
                        );
                    }
                });
                timings.push({ label: `Attribute snippet extraction`, ms: attrMs });

                // === Highlighting ===
                const [, hlMs] = timed(() => {
                    searchService.highlightSearchResults(trimmed, ["target"]);
                });
                timings.push({ label: `Highlighting`, ms: hlMs });

                // === Final mapping (getNoteTitleAndIcon) ===
                const [, mapMs] = timed(() => {
                    for (const r of trimmed) {
                        beccaService.getNoteTitleAndIcon(r.noteId);
                    }
                });
                timings.push({ label: `getNoteTitleAndIcon (${trimmed.length} results)`, ms: mapMs });

                // === Full autocomplete for comparison ===
                const [autoResults, autoMs] = timed(() => {
                    return searchService.searchNotesForAutocomplete("target", true);
                });
                timings.push({ label: `Full autocomplete call (end-to-end)`, ms: autoMs });

                reportTimings(`Granular Autocomplete — ${noteCount} notes`, timings);
                expect(autoResults.length).toBeGreaterThan(0);
            });
        }
    });

    /**
     * Test the specific cost of normalizeSearchText which is called
     * pervasively throughout the pipeline.
     */
    describe("normalizeSearchText cost", () => {

        it("profile normalizeSearchText at scale", () => {
            buildDataset(5000, { matchFraction: 0.2, contentWordCount: 100 });

            // Generate various text lengths to profile
            const shortTexts = Array.from({ length: 5000 }, () => randomWord(10));
            const mediumTexts = Array.from({ length: 5000 }, () =>
                Array.from({ length: 20 }, () => randomWord(6)).join(" ")
            );
            const longTexts = Object.values(becca.notes).map(n => n.getFlatText());

            console.log("\n=== normalizeSearchText cost ===");

            const [, shortMs] = timed(() => {
                for (const t of shortTexts) normalizeSearchText(t);
            });
            console.log(`  5000 short texts (10 chars):    ${shortMs.toFixed(1)}ms (${(shortMs/5000*1000).toFixed(1)}µs/call)`);

            const [, medMs] = timed(() => {
                for (const t of mediumTexts) normalizeSearchText(t);
            });
            console.log(`  5000 medium texts (120 chars):  ${medMs.toFixed(1)}ms (${(medMs/5000*1000).toFixed(1)}µs/call)`);

            const [, longMs] = timed(() => {
                for (const t of longTexts) normalizeSearchText(t);
            });
            console.log(`  ${longTexts.length} flat texts (varying):  ${longMs.toFixed(1)}ms (${(longMs/longTexts.length*1000).toFixed(1)}µs/call)`);
        });
    });

    /**
     * Test the searchPathTowardsRoot recursive walk which runs
     * for every candidate note in NoteFlatTextExp.
     */
    describe("searchPathTowardsRoot cost", () => {

        it("profile recursive walk with varying hierarchy depth", () => {
            console.log("\n=== Search path walk vs hierarchy depth ===");

            for (const depth of [3, 5, 8, 12]) {
                buildDataset(2000, {
                    matchFraction: 0.15,
                    depth,
                    contentWordCount: 50
                });

                const [results, ms] = timed(() => {
                    const ctx = new SearchContext({ fastSearch: true });
                    return searchService.findResultsWithQuery("target", ctx);
                });
                console.log(`  depth=${depth}: ${ms.toFixed(1)}ms (${results.length} results)`);
            }
        });
    });

    /**
     * Content snippet extraction scaling — the operation that calls
     * note.getContent() for each result.
     */
    describe("Content snippet extraction", () => {

        it("profile snippet extraction with varying content sizes", () => {
            console.log("\n=== Content snippet extraction vs content size ===");

            for (const wordCount of [50, 200, 500, 1000, 2000, 5000]) {
                buildDataset(500, {
                    matchFraction: 0.5,
                    contentWordCount: wordCount
                });

                const ctx = new SearchContext({ fastSearch: true });
                const results = searchService.findResultsWithQuery("target", ctx);
                const trimmed = results.slice(0, 200);

                const [, ms] = timed(() => {
                    for (const r of trimmed) {
                        r.contentSnippet = searchService.extractContentSnippet(
                            r.noteId, ["target"]
                        );
                    }
                });

                const avgContentLen = Object.values(syntheticContent)
                    .slice(0, 100)
                    .reduce((s, c) => s + c.length, 0) / 100;

                console.log(`  ${String(wordCount).padStart(5)} words/note (avg ${Math.round(avgContentLen)} chars) × ${trimmed.length} results: ${ms.toFixed(1)}ms (${(ms / trimmed.length).toFixed(3)}ms/note)`);
            }
        });

        it("profile snippet extraction with varying result counts", () => {
            console.log("\n=== Content snippet extraction vs result count ===");

            buildDataset(2000, {
                matchFraction: 0.5,
                contentWordCount: 500
            });

            const ctx = new SearchContext({ fastSearch: true });
            const allResults = searchService.findResultsWithQuery("target", ctx);

            for (const count of [5, 10, 20, 50, 100, 200]) {
                const subset = allResults.slice(0, count);

                const [, ms] = timed(() => {
                    for (const r of subset) {
                        r.contentSnippet = searchService.extractContentSnippet(
                            r.noteId, ["target"]
                        );
                    }
                });

                console.log(`  ${String(count).padStart(3)} results: ${ms.toFixed(1)}ms (${(ms / count).toFixed(3)}ms/note)`);
            }
        });
    });

    /**
     * Two-phase exact/fuzzy search cost.
     */
    describe("Two-phase search cost", () => {

        for (const noteCount of [1000, 5000, 10000]) {
            it(`exact vs progressive with ${noteCount} notes`, () => {
                const timings: TimingEntry[] = [];

                buildDataset(noteCount, { matchFraction: 0.005, contentWordCount: 50 });

                const [exactR, exactMs] = timed(() => {
                    const ctx = new SearchContext({ fastSearch: true });
                    ctx.enableFuzzyMatching = false;
                    return searchService.findResultsWithQuery("target", ctx);
                });
                timings.push({ label: `Exact-only (${exactR.length} results)`, ms: exactMs });

                const [progR, progMs] = timed(() => {
                    const ctx = new SearchContext({ fastSearch: true });
                    return searchService.findResultsWithQuery("target", ctx);
                });
                timings.push({ label: `Progressive exact→fuzzy (${progR.length} results)`, ms: progMs });

                const overhead = progMs - exactMs;
                timings.push({ label: `Fuzzy phase overhead`, ms: Math.max(0, overhead) });

                reportTimings(`Two-phase — ${noteCount} notes`, timings);
            });
        }
    });

    /**
     * End-to-end scaling to give the full picture.
     */
    describe("End-to-end scaling", () => {

        it("autocomplete at different scales", () => {
            console.log("\n=== End-to-end autocomplete scaling ===");
            console.log("  (fastSearch=true, monkeypatched getContent, no real SQL)");

            for (const noteCount of [100, 500, 1000, 2000, 5000, 10000, 20000]) {
                buildDataset(noteCount, {
                    matchFraction: 0.2,
                    contentWordCount: 300,
                    depth: 4
                });

                // Warm up
                searchService.searchNotesForAutocomplete("target", true);

                const times: number[] = [];
                for (let i = 0; i < 3; i++) {
                    const [, ms] = timed(() => searchService.searchNotesForAutocomplete("target", true));
                    times.push(ms);
                }

                const avg = times.reduce((a, b) => a + b, 0) / times.length;
                const min = Math.min(...times);

                console.log(
                    `  ${String(noteCount).padStart(6)} notes: avg ${avg.toFixed(1)}ms  ` +
                    `min ${min.toFixed(1)}ms`
                );
            }
        });

        it("compare fast vs non-fast search", () => {
            console.log("\n=== Fast vs non-fast search (no real SQL for content) ===");

            for (const noteCount of [500, 2000, 5000]) {
                buildDataset(noteCount, {
                    matchFraction: 0.2,
                    contentWordCount: 200,
                    depth: 4
                });

                const [, fastMs] = timed(() => {
                    const ctx = new SearchContext({ fastSearch: true });
                    return searchService.findResultsWithQuery("target", ctx);
                });

                // Non-fast search tries NoteContentFulltextExp which uses sql.iterateRows
                // This will likely fail/return empty since there's no real DB, but we
                // can still measure the overhead of attempting it
                let nonFastMs: number;
                let nonFastCount: number;
                try {
                    const [results, ms] = timed(() => {
                        const ctx = new SearchContext({ fastSearch: false });
                        return searchService.findResultsWithQuery("target", ctx);
                    });
                    nonFastMs = ms;
                    nonFastCount = results.length;
                } catch {
                    nonFastMs = -1;
                    nonFastCount = -1;
                }

                console.log(
                    `  ${String(noteCount).padStart(5)} notes: fast=${fastMs.toFixed(1)}ms  ` +
                    `non-fast=${nonFastMs >= 0 ? nonFastMs.toFixed(1) + 'ms' : 'FAILED (no real DB)'} ` +
                    `(non-fast results: ${nonFastCount})`
                );
            }
        });
    });
});
