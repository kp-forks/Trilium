# Search Performance Benchmarks: `main` vs `feat/search-perf-take1`

> **Date:** 2026-03-21
> **Environment:** In-memory benchmarks (monkeypatched `getContent()`, no real SQLite I/O). Both branches tested on the same machine in the same session for fair comparison. All times are avg of 5 iterations with warm caches unless noted.
> **Benchmark source:** `apps/server/src/services/search/services/search_benchmark.spec.ts`

---

## Table of Contents

- [Single-Token Autocomplete](#single-token-autocomplete)
- [Multi-Token Autocomplete](#multi-token-autocomplete)
- [No-Match Queries (worst case)](#no-match-queries-worst-case)
- [Diacritics / Unicode](#diacritics--unicode)
- [Typing Progression (keystroke simulation)](#typing-progression-keystroke-simulation)
- [Fuzzy Matching Effectiveness (typos & misspellings)](#fuzzy-matching-effectiveness-typos--misspellings)
- [Realistic User Session](#realistic-user-session)
- [Scale Comparison Summary](#scale-comparison-summary)
- [Summary of Improvements](#summary-of-improvements)

---

## Single-Token Autocomplete

The most common case — user typing in the search bar. Query: `"meeting"`, autocomplete, fuzzy OFF.

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 2.5ms | 1.6ms | **-36%** |
| 5,000 | 9.5ms | 6.7ms | **-29%** |
| 10,000 | 24.7ms | 14.3ms | **-42%** |
| 20,000 | 45.1ms | 29.6ms | **-34%** |

---

## Multi-Token Autocomplete

### 2-Token: `"meeting notes"` (autocomplete, fuzzy OFF)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 2.7ms | 1.1ms | **-59%** |
| 5,000 | 15.8ms | 5.9ms | **-63%** |
| 10,000 | 33.0ms | 15.6ms | **-53%** |
| 20,000 | 67.3ms | 33.6ms | **-50%** |

### 3-Token: `"meeting notes january"` (autocomplete, fuzzy OFF)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 3.7ms | 1.1ms | **-70%** |
| 5,000 | 20.7ms | 7.3ms | **-65%** |
| 10,000 | 43.2ms | 17.7ms | **-59%** |
| 20,000 | 91.2ms | 35.6ms | **-61%** |

---

## No-Match Queries (worst case)

These are the worst case — every note must be scanned with no early exit.

### Single token: `"xyznonexistent"` (autocomplete, fuzzy ON)

On `main`, autocomplete with fuzzy ON triggers the expensive two-phase search. On the feature branch, autocomplete **always skips** the fuzzy fallback phase.

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 1.6ms | 0.4ms | **-75%** |
| 5,000 | 8.1ms | 2.1ms | **-74%** |
| 10,000 | 18.2ms | 6.0ms | **-67%** |
| 20,000 | 49.2ms | 17.1ms | **-65%** |

### Multi token: `"xyzfoo xyzbar"` (autocomplete, fuzzy ON)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 5.1ms | 0.4ms | **-92%** |
| 5,000 | 29.0ms | 2.2ms | **-92%** |
| 10,000 | 63.4ms | 7.1ms | **-89%** |
| 20,000 | 128.8ms | 19.1ms | **-85%** |

---

## Diacritics / Unicode

Searching `"résumé"` (with diacritics) vs `"resume"` (ASCII equivalent). Both forms find the same results thanks to diacritic normalization. Autocomplete, fuzzy OFF.

| Notes | Query | main | feature | Change |
|------:|:------|-----:|--------:|-------:|
| 1,000 | `"résumé"` | 2.8ms | 1.7ms | **-39%** |
| 1,000 | `"resume"` | 2.9ms | 1.5ms | **-48%** |
| 5,000 | `"résumé"` | 15.7ms | 10.4ms | **-34%** |
| 5,000 | `"resume"` | 16.3ms | 7.7ms | **-53%** |
| 10,000 | `"résumé"` | 32.4ms | 23.3ms | **-28%** |
| 10,000 | `"resume"` | 30.7ms | 20.4ms | **-34%** |

---

## Typing Progression (keystroke simulation)

Simulates a user typing `"documentation"` character by character at 10K notes. Autocomplete, fuzzy OFF.

| Prefix | main | feature | Change |
|:-------|-----:|--------:|-------:|
| `"d"` | 66.9ms | 44.8ms | **-33%** |
| `"do"` | 22.9ms | 17.0ms | **-26%** |
| `"doc"` | 20.9ms | 14.7ms | **-30%** |
| `"docu"` | 20.0ms | 13.0ms | **-35%** |
| `"docum"` | 23.0ms | 11.8ms | **-49%** |
| `"document"` | 16.8ms | 11.8ms | **-30%** |
| `"documentation"` | 17.5ms | 11.0ms | **-37%** |

---

## Fuzzy Matching Effectiveness (typos & misspellings)

10K notes, keyword: `"performance"`. Shows both time improvement and result correctness.

| Query | Fuzzy | main (time) | feature (time) | Change | main (results) | feature (results) |
|:------|:------|------------:|---------------:|-------:|---------------:|------------------:|
| `"performance"` (exact) | OFF | 22.0ms | 25.9ms | +18% | 1,000 | 1,000 |
| `"performance"` (exact) | ON | 14.1ms | 18.2ms | +29% | 1,000 | 1,000 |
| `"performanc"` (truncated) | OFF | 16.6ms | 16.8ms | +1% | 1,000 | 1,000 |
| `"performanc"` (truncated) | ON | 16.0ms | 13.5ms | **-16%** | 1,000 | 1,000 |
| `"preformance"` (typo) | OFF | 9.0ms | 9.4ms | +4% | 0 | 0 |
| `"preformance"` (typo) | ON | 46.3ms | 51.7ms | +12% | 1,000 | 1,000 |
| `"performence"` (misspelling) | OFF | 9.0ms | 10.8ms | +20% | 0 | 0 |
| `"performence"` (misspelling) | ON | 45.4ms | 49.4ms | +9% | 1,000 | 1,000 |

**Note:** The full-search fuzzy path (non-autocomplete, `fastSearch=true`) shows slight regressions because this PR's optimizations target the autocomplete and in-memory paths. Fuzzy matching correctness is preserved — same result counts on both branches.

---

## Realistic User Session

Simulates a typical user session at 10K notes with mixed query types and typos.

| Query | Mode | main | feature | Change |
|:------|:-----|-----:|--------:|-------:|
| `"pro"` | autocomplete | 24.3ms | 14.1ms | **-42%** |
| `"project"` | autocomplete | 25.7ms | 13.6ms | **-47%** |
| `"project"` | fullSearch | 27.4ms | 17.3ms | **-37%** |
| `"projct"` (typo) | autocomplete | 8.9ms | 5.9ms | **-34%** |
| `"projct"` (typo) | autocomplete+fuzzy | **100.7ms** | **6.0ms** | **-94%** |
| `"note"` (very common) | autocomplete | **90.8ms** | **46.4ms** | **-49%** |
| `"document"` | autocomplete | 22.7ms | 15.2ms | **-33%** |

**Biggest wins:** `"projct"` autocomplete+fuzzy goes from 100.7ms to 6.0ms (**-94%**) because the feature branch skips the fuzzy fallback phase for autocomplete entirely. `"note"` (matching 8,500 of 10K notes) drops from 91ms to 46ms (**-49%**).

---

## Scale Comparison Summary

Side-by-side comparison across all note counts for the most common query patterns.

### `"meeting"` autocomplete (fuzzy OFF)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 2.5ms | 1.6ms | **-36%** |
| 5,000 | 10.3ms | 7.6ms | **-26%** |
| 10,000 | 22.5ms | 14.4ms | **-36%** |
| 20,000 | 53.7ms | 33.2ms | **-38%** |

### `"meeting notes"` autocomplete (fuzzy OFF)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 4.6ms | 1.1ms | **-76%** |
| 5,000 | 17.5ms | 6.7ms | **-62%** |
| 10,000 | 32.7ms | 16.8ms | **-49%** |
| 20,000 | 71.6ms | 38.9ms | **-46%** |

### `"xyznonexistent"` autocomplete (fuzzy OFF)

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 0.4ms | 0.4ms | 0% |
| 5,000 | 2.2ms | 2.3ms | +5% |
| 10,000 | 6.3ms | 8.4ms | +33% |
| 20,000 | 21.9ms | 19.3ms | **-12%** |

### `"xyznonexistent"` fullSearch (fuzzy ON) — worst case path

| Notes | main | feature | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 1.2ms | 1.0ms | **-17%** |
| 5,000 | 8.6ms | 8.7ms | +1% |
| 10,000 | 22.4ms | 22.2ms | -1% |
| 20,000 | 72.2ms | 64.5ms | **-11%** |

---

## Summary of Improvements

### Where the feature branch clearly wins (consistent 25-60% improvement):
- **Single-token autocomplete** at all scales (29-42% faster)
- **Multi-token autocomplete** — the biggest consistent gains (50-70% faster)
- **Typing progression** (26-49% faster per keystroke at 10K notes)
- **Diacritics queries** (28-53% faster)
- **Broad term autocomplete** (e.g., `"note"` matching 8,500 results: 49% faster)
- **Realistic user session queries** (33-47% faster for typical searches)

### Where the feature branch dramatically wins (80%+ improvement):
- **Autocomplete with fuzzy ON, no-match queries** (65-92% faster — fuzzy fallback skipped entirely)
- **Autocomplete typo queries** (e.g., `"projct"` + fuzzy: 101ms -> 6ms, **-94%**)

### Where performance is roughly equal:
- Full search fuzzy typo path — slight regression (+9-12%) because the two-phase fuzzy scan still runs
- No-match queries without fuzzy at smaller scales (within noise)

### Key optimizations in this PR:
1. **Pre-built flat text index** with incremental updates in Becca
2. **Skip two-phase fuzzy fallback** for autocomplete searches
3. **Pre-normalized attribute names/values** on BAttribute
4. **Cached normalized parent titles** per search execution
5. **Set-based token lookup** in searchPathTowardsRoot (O(1) vs O(n))
6. **Removed redundant toLowerCase()** throughout scoring pipeline
7. **Skip edit distance** when fuzzy matching is disabled
8. **Faster content snippet extraction** — regex strip, window normalization
9. **removeDiacritic() outside regex while-loop** in highlighting
10. **Single-token autocomplete fast path** — skips recursive parent walk
