# Contribution process (what a reviewer validates)

The process side of a review — relevant when reviewing for the **ckeditor5 project itself**, or a
package that adopts its conventions. (A standalone plugin in your own repo may use a different
process; treat this as the upstream model.) Paths like `.changelog/` refer to the upstream repo.

## Changelog entries (file-based)

CKEditor uses a Markdown, file-based changelog (Changesets-style): each change ships a file in
`.changelog/` that is compiled into the release changelog. **A PR with user-facing changes is
expected to include a changelog entry.**

- Create with **`pnpm run nice`** (NICE = New Individual Changelog Entry). It writes
  `.changelog/YYYYMMDDHHMMSS_{branch-name}.md` with a frontmatter template to fill in. One file =
  **one change** (add several files for several changes).
- Frontmatter fields:
  - `type` (**required**) — one of:
    | type | release | meaning |
    |------|---------|---------|
    | `Feature` | minor | new user-facing functionality |
    | `Fix` | patch | bug fix / small improvement |
    | `Other` | patch | enhancement/refactor, not a fix or feature (e.g. API cleanup) |
    | `Major breaking change` | major | breaks the integration / plugin-dev API |
    | `Minor breaking change` | minor | breaks the low-level customizable API |
  - `scope` (optional) — affected package short name(s), `@ckeditor/` stripped (e.g. `ckeditor5-ui`);
    most-impacted first; omit for broad/generic changes; use `ckeditor5` for the main package.
  - `closes` / `see` (optional) — issues resolved / referenced. Formats: `123`,
    `ckeditor/ckeditor5#123`, or full URL.
  - `communityCredits` (optional) — GitHub usernames of external contributors to credit.
  - **body** (**required**) — a concise, **user-facing** summary (this text ships in the public
    changelog). Reference methods as `ClassName#methodName()`.

Example:

```md
---
type: Fix
scope:
  - ckeditor5-link
closes:
  - 14724
---

The link balloon no longer steals focus when opening via keyboard.
```

**As a reviewer**, validate the entry (the changelog doc assigns this explicitly): correct `type`,
right issue reference(s), breaking-change flagged correctly, grammar, and that the message makes
sense to *other developers* in the context of the whole editor — not just to the author. Fix it via
GitHub suggestions if needed. The new file-based system is for **public, user-facing** changes only
(internal-only changes need no entry).

## Tests & coverage

- **100% code coverage including branches** is required; PRs with missing tests are not accepted.
- Coverage is necessary but not sufficient: **every change must be tested** — a bug fix that doesn't
  move coverage still needs a test proving the fix. A manual test may also be requested.
- See the `ckeditor5-testing` skill for how the suite runs.

## Code style

Enforced partly by Git hooks (lint + style on commit), but not everything is auto-caught — review
against the `ckeditor5-plugin-development` skill's `references/conventions.md`. Don't rely on tools
alone.

## Pull requests

- Open/identify a **ticket** first (skippable only for trivial typo/doc changes); reference the
  ticket(s) the PR resolves.
- Branch naming: **`i/GITHUB-ISSUE-NUMBER`**.
- **Minimal & focused** — only what the ticket describes; no unrelated changes squeezed in.
- Provide context in the PR: how to test, decisions made, known problems.
- Merge: typically **Squash and merge** (the changelog comes from the `.changelog/` file, not the
  commit messages, so you don't copy anything at merge time).

## CLA & signed commits

- A signed **Contributor License Agreement** (cla.ckeditor.com) is required for contributions to be
  accepted.
- Since **January 2025**, all commits to the main branches **must be signed** (Git signing; the GPG
  key's name/email must match the committer). Part of their SOC2 compliance.

## Reviewer checklist (process)

- [ ] Changelog entry present for user-facing changes, with correct `type`/`scope`/`closes` and a
      clear user-facing body.
- [ ] Tests cover the change itself; coverage stays at 100%.
- [ ] PR is minimal and references its ticket; branch is `i/NNN`.
- [ ] Breaking changes flagged (`Major`/`Minor breaking change`) and justified.
- [ ] Commits signed; CLA in place (for external contributors).
