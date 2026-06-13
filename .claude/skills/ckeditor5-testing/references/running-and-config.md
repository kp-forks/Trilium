# Running tests & configuration

> **Two contexts.** The **per-package scripts** below are what the package-generator produces, so
> they apply to a standalone plugin package in your own project. The **root runner**,
> `createVitestConfig` factory, `--files` patterns, manual-test and memory-test sections describe how
> the **upstream ckeditor5 monorepo** tests itself — paths like `vitest.config.ts`,
> `packages/*/vitest.config.ts`, and `test_setup.js` refer to that repository
> ([github.com/ckeditor/ckeditor5](https://github.com/ckeditor/ckeditor5)), not your project. Use the
> monorepo sections only when working inside ckeditor5 itself.

## Per-package scripts

Each package's `package.json` defines:

| Script | Command | Purpose |
|--------|---------|---------|
| `test` | `vitest run` | One-shot run. |
| `test:debug` | `vitest` | Watch mode (re-runs on change; interactive). |
| `test:headless` | `vitest run --browser.headless` | Headless browser run (CI-like). |
| `coverage` | `pnpm run test:headless --coverage` | Headless + coverage (100% gate). |

Useful ad-hoc invocations from a package directory:

```bash
vitest run highlightcommand        # filter by filename substring
vitest run -t "execute"            # filter by test name (-t/--testNamePattern)
vitest --browser.headless          # watch, headless
vitest run --coverage              # coverage for this package
```

## Root runner (dev-tools wrapper)

The root `pnpm run test` calls `ckeditor5-dev-tests-run-automated` (from
`@ckeditor/ckeditor5-dev-tests`), which orchestrates Vitest across packages. It selects packages
as Vitest **projects** by short name and supports the legacy `--files` patterns.

```bash
pnpm run test                          # whole suite
pnpm run test -- --files=highlight     # one package (short name)
pnpm run test -- -c --files=engine     # with coverage
pnpm run test -- -cw --files=engine/view/,typing   # coverage + watch, sub-dir + package
```

`--files` (alias `-f`) patterns (also used by manual tests):

| Pattern | Meaning |
|---------|---------|
| `core` / `ckeditor5-core` | One package (short or full name). |
| `editor-*` | Glob over package names. |
| `!core` / `!(core\|engine)` | Exclude one/several packages. |
| `engine/view/` | A sub-directory under a package's `tests/`. |
| `basic-styles/bold*` | Filename glob within a package. |
| `a,b,c` | Comma-separated sum of patterns. |

Other documented args (legacy Karma names; some map onto Vitest via the wrapper): `--watch`/`-w`,
`--coverage`/`-c`, `--source-map`/`-s`, `--verbose`/`-v`, `--browsers`, `--port`,
`--identity-file`/`-i` (license file for closed-source features). Running tests for the whole
monorepo root (no package) is not supported — tests belong to a package's `tests/` dir.

## Vitest configuration

Root `vitest.config.ts` exports two factories; **package configs should not configure Vitest
from scratch** — they call the factory:

```ts
// packages/ckeditor5-<name>/vitest.config.ts
import type { ViteUserConfig } from 'vitest/config';
import { createVitestConfig } from '../../vitest.config';

export default createVitestConfig( { name: '<short-package-name>' } );
```

`createVitestConfig({ name, ...overrides })` provides the shared baseline; `name` is the short
package name used by `--project <short-name>`. Any extra props are merged into `test` as
overrides. The baseline sets:

- `globals: true`; `include: [ 'tests/**/*.{js,ts}' ]`;
  `exclude: [ '**/_utils', '**/fixtures', '**/manual' ]`.
- `setupFiles: [ test_setup.js ]` — sets `globalThis.CKEDITOR_GLOBAL_LICENSE_KEY = 'GPL'`.
- `testTimeout: 5000`.
- **Browser mode** via `@vitest/browser-playwright`, Chromium (`channel: 'chrome'`), viewport
  1920×1080, `screenshotFailures: false`. (The browser provider is pluggable — `@vitest/browser-webdriverio`
  is an equally valid choice; downstream projects pick one. `happy-dom`/`jsdom` also works for tests
  that don't need real layout, though CKEditor UI/widget tests generally want a real browser.)
- **Coverage** (`v8`): `include: [ 'src/**' ]`, excludes `src/index.ts`, `src/augmentation.ts`,
  `src/**/*config.ts`; `thresholds: { 100: true }`; reporters `text`, `html`.
- A `load-svg` plugin so `import icon from './x.svg'` yields the SVG string.

`createWorkspaceConfig( projects )` (default export) wires the root run across
`packages/*/vitest.config.ts` and the combined coverage (`html`, `json`, `lcovonly` →
`coverage-vitest/`). Because tests run in a **real browser**, DOM APIs are available directly
(no jsdom).

## Manual tests

Human-run smoke tests, served by `pnpm run manual` (default `http://localhost:8125`). A manual
test = **three files** sharing a base name in a `tests/manual/` directory (which must sit at the
root of `tests/`, e.g. `tests/manual/view/focus.js`, not `tests/view/manual/focus.js`):

- `<name>.md` — the steps to perform and what to verify.
- `<name>.js`/`.ts` — sets up an editor (`window.editor = editor;`).
- `<name>.html` — the markup (fragment is fine; merged into a template).

```js
import { ClassicEditor, Essentials, Paragraph } from 'ckeditor5';
ClassicEditor.create( { attachTo: document.querySelector( '#editor' ),
	licenseKey: 'GPL', plugins: [ Essentials, Paragraph ] } )
	.then( editor => { window.editor = editor; } );
```

`pnpm run manual` options: `--files`, `--language`, `--additional-languages`, `--debug`/`-d`
(e.g. `--debug engine` enables `// @if CK_DEBUG_ENGINE //` lines; on by default), `--port`,
`--disable-watch`. Add manual-test dependencies to the package `devDependencies`. Vitest
excludes `**/manual`, so manual tests never run as units. `pnpm run manual:verify` crawls the
manual-test pages headlessly to ensure they at least open without errors.

## Memory-leak tests

`pnpm run test:memory` builds a browser bundle and runs create/destroy cycles per editor in
headless Chromium, reporting **Baseline / Growth / Tail Growth / Status** (status `OK` when
Growth and Tail Growth stay under threshold). Options: `--editor <Name>` (repeatable; defaults
to Balloon/Classic/Decoupled/Inline/MultiRoot), `--html <file>` (from `scripts/memory/assets`),
`--no-build` (reuse existing assets).
