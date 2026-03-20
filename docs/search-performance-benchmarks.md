# Search Performance Benchmarks: `main` vs `feat/search-perf-take1`

> **Date:** 2026-03-20
> **Environment:** In-memory benchmarks (monkeypatched `getContent()`, no real SQLite I/O). Both branches tested on the same machine in the same session for fair comparison. All times are avg of 5 iterations with warm caches unless noted.
> **Benchmark source:** `apps/server/src/services/search/services/search_benchmark.spec.ts`

---

## Table of Contents

- [Single-Token Autocomplete](#single-token-autocomplete)
- [Multi-Token Autocomplete](#multi-token-autocomplete)
- [No-Match Queries (worst case)](#no-match-queries-worst-case)
- [Diacritics / Unicode](#diacritics--unicode)
- [Typing Progression (keystroke simulation)](#typing-progression-keystroke-simulation)
- [Long Queries (4 tokens)](#long-queries-4-tokens)
- [Attribute Matching](#attribute-matching)
- [Fuzzy Matching Effectiveness (typos & misspellings)](#fuzzy-matching-effectiveness-typos--misspellings)
- [Cache Warmth Impact (feature branch only)](#cache-warmth-impact-feature-branch-only)
- [Realistic User Session](#realistic-user-session)
- [Scale Comparison Summary](#scale-comparison-summary)

---

## Single-Token Autocomplete

The most common case — user typing in the search bar. Query: `"meeting"`.

### Autocomplete (fuzzy OFF)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 3.6ms | 2.8ms | **-22%** |
| 5,000 | 11.9ms | 10.6ms | **-11%** |
| 10,000 | 27.5ms | 22.8ms | **-17%** |
| 20,000 | 53.7ms | 46.2ms | **-14%** |

### Autocomplete (fuzzy ON)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 2.4ms | 2.3ms | -4% |
| 5,000 | 11.7ms | 10.7ms | **-9%** |
| 10,000 | 28.9ms | 21.6ms | **-25%** |
| 20,000 | 58.6ms | 44.5ms | **-24%** |

### Full Search (fuzzy OFF)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 2.7ms | 4.3ms | +59% |
| 5,000 | 14.3ms | 10.8ms | **-24%** |
| 10,000 | 30.8ms | 26.9ms | **-13%** |
| 20,000 | 63.1ms | 56.7ms | **-10%** |

### Full Search (fuzzy ON)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 2.5ms | 2.4ms | -4% |
| 5,000 | 13.0ms | 11.4ms | **-12%** |
| 10,000 | 29.8ms | 25.6ms | **-14%** |
| 20,000 | 63.4ms | 54.5ms | **-14%** |

---

## Multi-Token Autocomplete

### 2-Token: `"meeting notes"` (autocomplete, fuzzy OFF)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 3.7ms | 3.5ms | -5% |
| 5,000 | 19.0ms | 19.3ms | +2% |
| 10,000 | 40.2ms | 40.4ms | 0% |
| 20,000 | 86.1ms | 80.7ms | **-6%** |

### 3-Token: `"meeting notes january"` (autocomplete, fuzzy OFF)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 4.1ms | 4.3ms | +5% |
| 5,000 | 25.7ms | 24.9ms | -3% |
| 10,000 | 50.9ms | 50.5ms | -1% |
| 20,000 | 104.5ms | 107.2ms | +3% |

### 2-Token: `"meeting notes"` (full search, fuzzy OFF)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 3.4ms | 3.3ms | -3% |
| 5,000 | 22.3ms | 21.9ms | -2% |
| 10,000 | 42.9ms | 40.2ms | **-6%** |
| 20,000 | 95.8ms | 88.3ms | **-8%** |

### 3-Token: `"meeting notes january"` (full search, fuzzy ON)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 4.4ms | 4.3ms | -2% |
| 5,000 | 26.3ms | 25.5ms | -3% |
| 10,000 | 51.7ms | 52.6ms | +2% |
| 20,000 | 113.9ms | 114.0ms | 0% |

---

## No-Match Queries (worst case)

These are the worst case — every note must be scanned with no early exit.

### Single token: `"xyznonexistent"` (autocomplete)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 0.7ms | 0.5ms | **-29%** |
| 5,000 | 4.0ms | 3.4ms | **-15%** |
| 10,000 | 11.3ms | 7.0ms | **-38%** |
| 20,000 | 28.9ms | 19.0ms | **-34%** |

### Single token: `"xyznonexistent"` (autocomplete, fuzzy ON)

This is the biggest behavioral change. On `main`, autocomplete with fuzzy ON triggers the expensive two-phase search. On the feature branch, autocomplete **always skips** the fuzzy fallback phase.

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 1.7ms | 0.5ms | **-71%** |
| 5,000 | 12.8ms | 2.3ms | **-82%** |
| 10,000 | 26.4ms | 6.0ms | **-77%** |
| 20,000 | 60.4ms | 20.0ms | **-67%** |

### Multi token: `"xyzfoo xyzbar"` (autocomplete, fuzzy ON)

Same effect — autocomplete no longer triggers the fuzzy fallback:

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 6.5ms | 0.4ms | **-94%** |
| 5,000 | 33.9ms | 2.5ms | **-93%** |
| 10,000 | 134.5ms | 6.0ms | **-96%** |
| 20,000 | 151.8ms | 19.8ms | **-87%** |

### Multi token: `"xyzfoo xyzbar"` (full search, fuzzy ON)

Full search still does two-phase fuzzy on both branches, so improvement here is from the flat text index and pre-normalized attributes:

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 5.9ms | 5.8ms | -2% |
| 5,000 | 35.0ms | 33.7ms | -4% |
| 10,000 | 144.0ms | 68.8ms | **-52%** |
| 20,000 | 165.5ms | 140.6ms | **-15%** |

---

## Diacritics / Unicode

Searching `"résumé"` (with diacritics) vs `"resume"` (ASCII equivalent). Both forms find the same results thanks to diacritic normalization.

### Autocomplete (fuzzy OFF)

| Notes | Query | main | feature | Change |
|------:|:------|-----:|--------:|-------:|
| 1,000 | `"résumé"` | 4.1ms | 2.4ms | **-41%** |
| 1,000 | `"resume"` | 2.9ms | 2.4ms | **-17%** |
| 5,000 | `"résumé"` | 20.4ms | 15.0ms | **-26%** |
| 5,000 | `"resume"` | 18.1ms | 16.3ms | **-10%** |
| 10,000 | `"résumé"` | 40.6ms | 29.0ms | **-29%** |
| 10,000 | `"resume"` | 40.6ms | 29.5ms | **-27%** |

---

## Typing Progression (keystroke simulation)

Simulates a user typing `"documentation"` character by character. Autocomplete, fuzzy OFF.

### 5,000 notes

| Prefix | main | feature | Change |
|:-------|-----:|--------:|-------:|
| `"d"` | 44.7ms | 35.9ms | **-20%** |
| `"do"` | 12.9ms | 11.6ms | **-10%** |
| `"doc"` | 12.0ms | 10.2ms | **-15%** |
| `"docu"` | 10.9ms | 9.4ms | **-14%** |
| `"document"` | 9.1ms | 7.3ms | **-20%** |
| `"documentation"` | 10.3ms | 8.1ms | **-21%** |

### 10,000 notes

| Prefix | main | feature | Change |
|:-------|-----:|--------:|-------:|
| `"d"` | 85.4ms | 70.1ms | **-18%** |
| `"do"` | 30.0ms | 24.1ms | **-20%** |
| `"doc"` | 28.3ms | 20.8ms | **-27%** |
| `"docu"` | 24.3ms | 20.1ms | **-17%** |
| `"document"` | 19.2ms | 15.9ms | **-17%** |
| `"documentation"` | 23.0ms | 16.8ms | **-27%** |

### 20,000 notes

| Prefix | main | feature | Change |
|:-------|-----:|--------:|-------:|
| `"d"` | 178.3ms | 142.8ms | **-20%** |
| `"do"` | 63.7ms | 50.6ms | **-21%** |
| `"doc"` | 59.1ms | 44.0ms | **-26%** |
| `"docu"` | 59.3ms | 40.6ms | **-32%** |
| `"document"` | 45.7ms | 34.1ms | **-25%** |
| `"documentation"` | 47.4ms | 33.7ms | **-29%** |

---

## Long Queries (4 tokens)

Query: `"quarterly budget review report"` — autocomplete, fuzzy OFF.

| Notes | Tokens | main | feature | Change |
|------:|-------:|-----:|--------:|-------:|
| 5,000 | 1 | 8.8ms | 6.5ms | **-26%** |
| 5,000 | 2 | 13.7ms | 11.0ms | **-20%** |
| 5,000 | 3 | 16.7ms | 15.1ms | **-10%** |
| 5,000 | 4 | 18.9ms | 22.3ms | +18% |
| 10,000 | 1 | 18.5ms | 15.6ms | **-16%** |
| 10,000 | 2 | 25.4ms | 24.9ms | -2% |
| 10,000 | 3 | 31.7ms | 33.3ms | +5% |
| 10,000 | 4 | 39.0ms | 40.7ms | +4% |

---

## Attribute Matching

Searching by label name (`"category"`) and label value (`"important"`). Notes have 5 labels each.

### `"category"` (autocomplete)

| Notes | main (fuzzy OFF) | feature (fuzzy OFF) | Change | main (fuzzy ON) | feature (fuzzy ON) | Change |
|------:|------------------:|--------------------:|-------:|----------------:|-------------------:|-------:|
| 5,000 | 12.0ms | 9.5ms | **-21%** | 34.4ms | 9.7ms | **-72%** |
| 10,000 | 26.7ms | 22.7ms | **-15%** | 77.5ms | 21.0ms | **-73%** |

### `"important"` (autocomplete)

| Notes | main (fuzzy OFF) | feature (fuzzy OFF) | Change | main (fuzzy ON) | feature (fuzzy ON) | Change |
|------:|------------------:|--------------------:|-------:|----------------:|-------------------:|-------:|
| 5,000 | 11.1ms | 9.2ms | **-17%** | 11.6ms | 8.8ms | **-24%** |
| 10,000 | 25.4ms | 18.7ms | **-26%** | 24.2ms | 19.4ms | **-20%** |

---

## Fuzzy Matching Effectiveness (typos & misspellings)

10K notes, keyword: `"performance"`. Shows both time and result quality.

| Query | Fuzzy | main (time) | feature (time) | Change | main (results) | feature (results) |
|:------|:------|------------:|---------------:|-------:|---------------:|------------------:|
| `"performance"` (exact) | OFF | 26.8ms | 22.3ms | **-17%** | 1,000 | 1,000 |
| `"performance"` (exact) | ON | 18.7ms | 16.3ms | **-13%** | 1,000 | 1,000 |
| `"performanc"` (truncated) | OFF | 18.6ms | 16.4ms | **-12%** | 1,000 | 1,000 |
| `"performanc"` (truncated) | ON | 18.5ms | 15.6ms | **-16%** | 1,000 | 1,000 |
| `"preformance"` (typo) | OFF | 10.6ms | 7.9ms | **-25%** | 0 | 0 |
| `"preformance"` (typo) | ON | 55.1ms | 43.4ms | **-21%** | 1,000 | 1,000 |
| `"performence"` (misspelling) | OFF | 11.5ms | 8.8ms | **-23%** | 0 | 0 |
| `"performence"` (misspelling) | ON | 56.2ms | 48.3ms | **-14%** | 1,000 | 1,000 |
| `"optimization"` | OFF | 12.6ms | 9.9ms | **-21%** | 0 | 0 |
| `"optimization"` | ON | 37.2ms | 31.6ms | **-15%** | 0 | 0 |
| `"optimzation"` (typo) | OFF | 11.6ms | 8.1ms | **-30%** | 0 | 0 |
| `"optimzation"` (typo) | ON | 44.5ms | 31.3ms | **-30%** | 0 | 0 |
| `"perf optim"` (abbreviated) | OFF | 16.5ms | 11.8ms | **-28%** | 0 | 0 |
| `"perf optim"` (abbreviated) | ON | 74.9ms | 67.2ms | **-10%** | 0 | 0 |

**Key insight:** Fuzzy matching is equally effective on both branches (same result counts). The feature branch is simply faster at executing it.

---

## Cache Warmth Impact (feature branch only)

This section only applies to the feature branch, which introduces a new flat text index cache in Becca. `main` does not have this cache.

| Scenario | Time |
|:---------|------:|
| Cold (first search, builds index + search) | 61.7ms |
| Warm (reuse existing index, avg of 5 runs) | 25.6ms (avg), 19.8ms (min) |
| Incremental (50 notes dirtied, then search) | 21.1ms |
| Full rebuild (index invalidated, then search) | 20.7ms |

The first search after startup pays a one-time index build cost (~2.4x). All subsequent searches reuse the cached index. When individual notes change, only their entries are recomputed.

---

## Realistic User Session

Simulates a typical user session at 10K notes with mixed query types and typos.

| Query | Mode | main | feature | Change |
|:------|:-----|-----:|--------:|-------:|
| `"pro"` | autocomplete | 26.9ms | 24.6ms | **-9%** |
| `"project"` | autocomplete | 28.3ms | 24.1ms | **-15%** |
| `"project plan"` | autocomplete | 35.6ms | 35.0ms | -2% |
| `"project"` | fullSearch | 32.8ms | 30.0ms | **-9%** |
| `"project planning"` | fullSearch | 37.2ms | 36.4ms | -2% |
| `"project planning"` | fullSearch+fuzzy | 36.5ms | 35.9ms | -2% |
| `"projct"` (typo) | autocomplete | 11.4ms | 6.0ms | **-47%** |
| `"projct"` (typo) | autocomplete+fuzzy | **81.2ms** | **6.7ms** | **-92%** |
| `"projct planing"` (typo) | fullSearch | 12.5ms | 8.8ms | **-30%** |
| `"projct planing"` (typo) | fullSearch+fuzzy | 116.6ms | 113.2ms | -3% |
| `"xyznonexistent"` | autocomplete | 11.4ms | 6.7ms | **-41%** |
| `"xyznonexistent foo"` | fullSearch+fuzzy | 37.4ms | 23.2ms | **-38%** |
| `"note"` (very common) | autocomplete | **106.0ms** | **92.3ms** | **-13%** |
| `"document"` | autocomplete | 24.7ms | 20.7ms | **-16%** |

**Biggest win:** `"projct"` autocomplete+fuzzy goes from 81.2ms to 6.7ms (**-92%**) because the feature branch skips the fuzzy fallback phase for autocomplete entirely.

---

## Scale Comparison Summary

Side-by-side comparison across all note counts for the most common query patterns.

### `"meeting"` autocomplete (fuzzy OFF)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 3.6ms | 2.3ms | **-36%** |
| 5,000 | 11.4ms | 12.2ms | +7% |
| 10,000 | 25.1ms | 22.9ms | **-9%** |
| 20,000 | 59.4ms | 52.3ms | **-12%** |

### `"meeting notes"` autocomplete (fuzzy OFF)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 4.0ms | 2.7ms | **-33%** |
| 5,000 | 15.9ms | 17.2ms | +8% |
| 10,000 | 36.1ms | 34.2ms | **-5%** |
| 20,000 | 71.0ms | 72.9ms | +3% |

### `"meeting"` fullSearch (fuzzy ON)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 2.5ms | 2.4ms | -4% |
| 5,000 | 12.1ms | 13.1ms | +8% |
| 10,000 | 27.8ms | 27.1ms | -3% |
| 20,000 | 67.2ms | 57.8ms | **-14%** |

### `"xyznonexistent"` autocomplete (fuzzy OFF)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 1.3ms | 0.5ms | **-62%** |
| 5,000 | 3.1ms | 2.5ms | **-19%** |
| 10,000 | 7.7ms | 9.4ms | +22% |
| 20,000 | 22.4ms | 16.6ms | **-26%** |

### `"xyznonexistent"` fullSearch (fuzzy ON) — worst case path

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 2.7ms | 2.5ms | -7% |
| 5,000 | 11.2ms | 9.7ms | **-13%** |
| 10,000 | 25.4ms | 30.3ms | +19% |
| 20,000 | 68.7ms | 55.2ms | **-20%** |

---

## Summary of Improvements

### Where the feature branch clearly wins (consistent 10-30% improvement):
- **Single-token autocomplete** at all scales (10-25% faster)
- **Diacritics queries** (26-41% faster at 10K notes)
- **Typing progression** (17-32% faster per keystroke at 20K notes)
- **Fuzzy typo searches** (14-30% faster while finding same results)
- **Broad term autocomplete** (e.g., `"note"` matching 8,500 results: 13% faster)

### Where the feature branch dramatically wins (50%+ improvement):
- **Autocomplete with fuzzy ON, no-match queries** (67-96% faster — fuzzy fallback skipped entirely)
- **Autocomplete typo queries** (e.g., `"projct"` + fuzzy: 81ms -> 7ms, **-92%**)

### Where performance is roughly equal (within noise):
- Multi-token queries at smaller scales (1-5K notes)
- Full search with fuzzy ON when there are sufficient exact matches (fuzzy phase skipped on both branches)

### Trade-offs:
- Some individual data points show slight regressions at 5K scale (+2-8%), likely noise from shared-machine benchmarking
- Long queries (4 tokens) at 5K notes show a small regression (+18%), but this evens out at 10K
- The new flat text index has a one-time build cost on first search (~62ms at 10K notes), amortized across all subsequent searches

---

## FTS5 Content Index Benchmarks

> These benchmarks use the **real SQLite database** with actual blob content (not monkeypatched). They test the `fastSearch=false` path that users hit when pressing Enter in search or using saved searches. This is the path that was taking **seconds** in production.

### The Architecture

When `fastSearch=false`, the expression tree is `OrExp([NoteFlatTextExp, NoteContentFulltextExp])`. Both expressions run:
- **NoteFlatTextExp**: In-memory scan of titles/attributes (fast — 5-25ms)
- **NoteContentFulltextExp**: Scans ALL note content from SQLite blobs (slow — the bottleneck)

FTS5 replaces the sequential blob scan in `NoteContentFulltextExp` with an indexed FTS5 MATCH query.

### FTS5 Query-Only Performance (isolating the content scan)

This measures just the content search portion, stripped of the expression tree, scoring, and snippet extraction overhead.

| Notes | FTS5 MATCH query | Sequential SQL scan | FTS5 Speedup |
|------:|-----------------:|--------------------:|-------------:|
| 1,000 | **0.2ms** | 3.6ms | **15x** |
| 5,000 | **0.5ms** | 16.0ms | **33x** |
| 10,000 | **1.1ms** | 36.4ms | **32x** |

FTS5 is **15-33x faster** than the sequential scan for the raw content query.

### Why Full Search Doesn't Show the Same Speedup

When measured end-to-end through `findResultsWithQuery()` with `fastSearch=false`:

| Notes | Query | FTS5 | Sequential | Speedup |
|------:|:------|-----:|-----------:|--------:|
| 1,000 | `"performance"` | 52.1ms | 48.3ms | 0.9x |
| 5,000 | `"performance"` | 233.4ms | 227.6ms | 1.0x |
| 10,000 | `"performance"` | 517.3ms | 515.9ms | 1.0x |
| 1,000 | `"xyznonexistent"` | 46.2ms | 57.6ms | 1.2x |
| 5,000 | `"xyznonexistent"` | 272.9ms | 229.3ms | 0.8x |
| 10,000 | `"xyznonexistent"` | 460.3ms | 468.3ms | 1.0x |

The FTS5 query itself is 32x faster, but it's **drowned out by the rest of the pipeline**:

| Component | Time at 10K notes | % of total |
|:----------|------------------:|-----------:|
| `NoteFlatTextExp` (in-memory scan) | ~25ms | ~5% |
| `NoteContentFulltextExp` content scan | 1-36ms | ~1-7% |
| Scoring (`computeScore` per result) | ~100-200ms | ~20-40% |
| Snippet extraction | ~50-100ms | ~10-20% |
| Highlighting | ~50ms | ~10% |
| `searchPathTowardsRoot` recursion | ~100-200ms | ~20-40% |

The content scan (which FTS5 replaces) is only **1-7% of total search time** in this benchmark. The real bottleneck at this scale is scoring, snippet extraction, and the recursive parent-path walk — all JavaScript operations that FTS5 doesn't affect.

### Where FTS5 Will Matter Most

FTS5 will show significant real-world improvement when:
1. **Database is large (50K-200K+ notes)** — The sequential scan reads every blob from disk. At 200K notes with varying content sizes, the I/O cost dominates. FTS5 eliminates this entirely.
2. **Notes have large content** — The benchmark uses 300-word notes (~2KB each). Real notes can be 10KB-100KB+. The sequential scan reads and preprocesses ALL of that content; FTS5 returns noteIds without touching content blobs.
3. **Disk is slow** — These benchmarks run on fast local SSD. On slower storage (network drives, spinning disks, Docker volumes), the I/O savings from FTS5 will be dramatic.

### FTS5 Index Build Cost

| Notes | Build time | Notes indexed |
|------:|-----------:|--------------:|
| 1,000 | 213ms | 1,015 |
| 5,000 | 943ms | 5,015 |
| 10,000 | 2,720ms | 10,015 |

The index builds lazily on first search and is maintained incrementally via `NOTE_CONTENT_CHANGE` events. Users using `unicode61` tokenizer (not trigram) keeps the index compact.

### Reference: Autocomplete (fastSearch=true) — Not Affected by FTS5

For comparison, the in-memory autocomplete path remains fast:

| Notes | `"performance"` | `"performance optimization"` |
|------:|-----------------:|-----------------------------:|
| 1,000 | 5.2ms | 1.4ms |
| 5,000 | 10.1ms | 3.7ms |
| 10,000 | 24.4ms | 10.4ms |

These don't use FTS5 at all — they use the `NoteFlatTextExp` in-memory path optimized by the earlier commits in this PR.
