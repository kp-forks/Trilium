---
name: ckeditor5-reviewing
description: >-
  Review or audit CKEditor 5 plugin/feature code or a PR/diff. Use when checking
  a CKEditor 5 plugin for correctness and idiom: schema / conversion / command /
  UI / widget code, and CKEditor-specific defects (asymmetric upcast/downcast,
  unconsumed upcast elements, missing inline-widget position mapping, command
  refresh/isEnabled bugs, memory leaks, t() gaps, editing/UI split violations,
  post-v42 import mistakes). Pairs with the ckeditor5-plugin-development and
  ckeditor5-testing skills and delegates their checklists.
---

# Reviewing CKEditor 5 plugins

A workflow and defect catalog for **reviewing** CKEditor 5 plugin/feature code — a distinct task
from writing it. This skill orchestrates the review and hunts CKEditor-specific bugs; it
**delegates the per-dimension "is this idiomatic?" checklists** to the companion skills rather
than duplicating them:

- **`ckeditor5-plugin-development`** — its `references/review-checklist.md` (architecture, schema,
  conversion, commands, UI, a11y) and `references/conventions.md` (naming, imports, JSDoc, TS).
- **`ckeditor5-testing`** — its review checklist and patterns for the test side.

Use those for "does this follow the conventions"; use this skill for **how to drive the review**
and **what subtle things tend to be wrong**.

## When to use

Reviewing a PR or diff that touches a CKEditor 5 plugin; auditing an existing plugin; sanity-
checking your own feature before opening a PR. For *writing* the feature, use
`ckeditor5-plugin-development`; for *writing tests*, use `ckeditor5-testing`.

## Review workflow

1. **Scope the diff.** What surface changed — editing (schema/conversion/command), UI
   (componentFactory/buttons/dropdowns/balloons), a widget, an editor type, config? New plugin or
   a change to an existing one? Which package(s)? This tells you which checklists and defect
   groups apply.
2. **Read model-first.** The model is the source of truth; trace the feature in order
   **schema → conversion → command → UI**. Confirm each layer is present and consistent (e.g. a
   new model element has a schema registration *and* upcast *and* downcast *and* an insertion path).
3. **Run the tests** for the affected code (see `ckeditor5-testing`). Coverage ≠ correctness:
   confirm the *change itself* is tested, not just that lines are hit. A bug fix with no
   new/changed test is a red flag even when coverage stays green.
4. **Observe behavior.** Attach the CKEditor Inspector (model / view / schema / commands), then:
   round-trip `editor.getData()` → `setData()` (does content survive a save?); exercise selection
   edge cases (collapsed vs. ranged, inside objects/limits, at attribute boundaries); toggle
   read-only.
5. **Apply the dimension checklists** (delegate to the two companion skills).
6. **Hunt defects** with `references/defect-patterns.md` — the high-value, easy-to-miss failure
   modes specific to CKEditor.
7. **Verify each finding before reporting it** (see below). Reproduce it, or cite the exact line
   and the rule it breaks. Discard the ones that don't hold up.
8. **Report** findings: severity-tagged, `file:line`, with the concrete fix or question.

## Triage / severity

- **Blocker** — data loss (content dropped on `getData()`), crashes/console errors, undo
  corruption, broken collaboration (non-OT model mutation), security (unsanitized HTML/XSS),
  schema corruption.
- **Major** — incorrect behavior in real selections, accessibility gaps (no keyboard path, missing
  labels/`addKeystrokeInfos`), memory leaks, command enabled where the schema disallows it.
- **Minor** — convention/naming/import-style issues, missing `t()`, redundant converters,
  non-idiomatic but working code.
- **Nit** — style preferences with no behavioral impact; mark them as optional.

Lead with blockers/majors; don't bury them under nits.

## Verify before reporting (avoid false positives)

A noisy review erodes trust. Confirm a finding is real before raising it. Common **false
positives** to *not* raise:

- "Missing downcast" when the code uses a **two-way** helper (`conversion.attributeToElement(...)`
  registers both directions) — count two-way helpers, not just `for('dataDowncast')`.
- "`getAttribute('data-x')` should be `.dataset`" inside a **converter callback** — that's a view
  element, not DOM; `.dataset` would silently drop the value (see the plugin-dev `conversion.md`
  view-element pitfall).
- "Boolean attribute should be set to `false`" — the idiom is to **remove** it (yields `undefined`).
- "Button state not updated" when it's `bind()`-ed to the command (reactive, not imperative).
- "Listener never removed" when added via `this.listenTo()` (auto-cleaned in `destroy()`).

When unsure, phrase it as a **question** ("Is `<mark>` intended to round-trip through `getData()`?
I don't see a `dataDowncast`.") rather than a false assertion.

## Reference map

| File | Use it for |
|------|-----------|
| `references/defect-patterns.md` | The CKEditor-specific bug catalog: for each, the symptom, how to spot it in a diff, why it's wrong, and the fix. The core of a correctness review. |

> **Out of scope:** the CKEditor *project's own* contribution process (the `.changelog/` entry
> system, `pnpm run nice`, CLA, signed commits, branch naming) is specific to contributing to the
> upstream ckeditor5 monorepo — not to reviewing a plugin in your own project — so this skill does
> not cover it. If you're contributing upstream, follow that repository's CONTRIBUTING guide.

## Provenance & source references

Self-contained and library-focused. Any `docs/…` / `packages/…` paths or the baseline commit point
into the **upstream CKEditor 5 repository**
([github.com/ckeditor/ckeditor5](https://github.com/ckeditor/ckeditor5)), not the project you are
reviewing. Distilled at upstream commit **`9ecca53627`** (mid-2026) from the patterns in the
companion skills and `docs/framework/contributing/code-style.md`. To refresh, compare those paths
against that commit inside a clone of ckeditor5 and bump the reference here.
