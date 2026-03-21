# Search Performance Benchmarks

Comparison of `main` vs `feat/search-perf-take1` branch.

> **Methodology:** In-memory benchmarks using synthetic datasets with monkeypatched `getContent()`. Both branches tested on the same machine in the same session. Times are avg of 5 iterations with warm caches. Note content I/O (`NoteContentFulltextExp` blob scan) is not measured — these numbers reflect the in-memory pipeline only.
>
> **Benchmark source:** `apps/server/src/services/search/services/search_benchmark.spec.ts`

---

## End-to-End Results at 10K Notes

### Autocomplete (typing in the search bar, `fastSearch=true`)

| Query | main | this PR | Change |
|:------|-----:|--------:|-------:|
| `"meeting"` | 24.7ms | 14.3ms | **-42%** |
| `"meeting notes"` | 33.0ms | 15.6ms | **-53%** |
| `"meeting notes january"` | 43.2ms | 17.7ms | **-59%** |
| `"documentation"` | 17.5ms | 11.0ms | **-37%** |
| `"note"` (matches 85% of notes) | 90.8ms | 46.4ms | **-49%** |
| `"projct"` (typo, fuzzy ON) | 100.7ms | 6.0ms | **-94%** |
| `"xyznonexistent"` (no match, fuzzy ON) | 18.2ms | 6.0ms | **-67%** |
| `"xyzfoo xyzbar"` (no match, fuzzy ON) | 63.4ms | 7.1ms | **-89%** |

### Full Search (pressing Enter, `fastSearch=false`)

| Query | main | this PR | Change |
|:------|-----:|--------:|-------:|
| `"meeting"` | 22.9ms | 19.6ms | **-14%** |
| `"meeting notes"` | 35.7ms | 17.4ms | **-51%** |
| `"meeting notes january"` | 43.4ms | 21.0ms | **-52%** |
| `"quarterly budget review report"` | 37.1ms | 18.3ms | **-51%** |
| `"project planning"` | 27.4ms | 17.3ms | **-37%** |

### Full Search with Fuzzy Matching

| Query | main | this PR | Change |
|:------|-----:|--------:|-------:|
| `"meeting"` | 23.3ms | 17.8ms | **-24%** |
| `"meeting notes"` | 33.8ms | 18.6ms | **-45%** |
| `"meeting notes january"` | 43.2ms | 18.0ms | **-58%** |
| `"quarterly budget review report"` | 39.5ms | 17.2ms | **-56%** |
| `"project planning"` | 32.8ms | 18.6ms | **-43%** |
| `"projct planing"` (typo, recovers 1,500 results) | 133.8ms | 94.8ms | **-29%** |
| `"xyzfoo xyzbar"` (no match, worst case) | 64.2ms | 61.4ms | -4% |

---

## Scaling Behavior

### Autocomplete: `"meeting notes"` (fuzzy OFF)

| Notes | main | this PR | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 2.7ms | 1.1ms | **-59%** |
| 5,000 | 15.8ms | 5.9ms | **-63%** |
| 10,000 | 33.0ms | 15.6ms | **-53%** |
| 20,000 | 67.3ms | 33.6ms | **-50%** |

### Full search: `"meeting notes january"` (fuzzy ON)

| Notes | main | this PR | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 3.7ms | 1.3ms | **-65%** |
| 5,000 | 21.2ms | 8.7ms | **-59%** |
| 10,000 | 43.2ms | 18.0ms | **-58%** |
| 20,000 | 92.8ms | 40.1ms | **-57%** |

### Autocomplete no-match: `"xyzfoo xyzbar"` (fuzzy ON)

| Notes | main | this PR | Change |
|------:|-----:|--------:|-------:|
| 1,000 | 5.1ms | 0.4ms | **-92%** |
| 5,000 | 29.0ms | 2.2ms | **-92%** |
| 10,000 | 63.4ms | 7.1ms | **-89%** |
| 20,000 | 128.8ms | 19.1ms | **-85%** |

### Typing progression at 10K notes (autocomplete, fuzzy OFF)

| Prefix typed | main | this PR | Change |
|:-------------|-----:|--------:|-------:|
| `"d"` | 66.9ms | 44.8ms | **-33%** |
| `"doc"` | 20.9ms | 14.7ms | **-30%** |
| `"document"` | 16.8ms | 11.8ms | **-30%** |
| `"documentation"` | 17.5ms | 11.0ms | **-37%** |

---

## What Changed

1. **Pre-built flat text index** with incremental dirty-marking in Becca — avoids rebuilding per-note flat text on every search
2. **Skip two-phase fuzzy fallback for autocomplete** — the user is still typing, fuzzy adds latency for no benefit
3. **Pre-normalized attribute names/values** cached on `BAttribute` at construction time
4. **Cached normalized parent titles** per search execution via `Map` in `NoteFlatTextExp`
5. **Set-based token lookup** in `searchPathTowardsRoot` (O(1) vs O(n) `Array.includes`)
6. **Removed redundant `toLowerCase()`** — `normalizeSearchText` already lowercases; callers were double-lowering
7. **Pre-normalize tokens once** in `addScoreForStrings` instead of re-normalizing per chunk
8. **Skip edit distance computation** when fuzzy matching is disabled
9. **Faster content snippet extraction** — regex `/<[^>]*>/g` instead of `striptags` library; normalize only the snippet window, not full content
10. **`removeDiacritic()` hoisted outside regex while-loop** in highlighting
11. **Single-token autocomplete fast path** — skips the recursive parent walk entirely, uses `getBestNotePath()` directly
12. **User option `searchEnableFuzzyMatching`** — lets users disable fuzzy matching for fastest possible search

---

## Known Limitations

- These benchmarks measure the **in-memory pipeline only** (titles, attributes, scoring, highlighting). The `NoteContentFulltextExp` sequential blob scan from SQLite is not exercised because `getContent()` is monkeypatched. In production, the full search path (`fastSearch=false`) includes reading every note's content from disk, which adds significant time at scale.
- Fuzzy matching on the full-search two-phase path shows slight regressions (+9-12%) for single-token queries because edit distance computation cost hasn't changed on that path. Multi-token queries still improve because the token normalization and tree walk optimizations apply to both paths.
- At 1K notes, some results show noise-level regressions. The optimizations target 5K+ note scales where overhead is measurable.
