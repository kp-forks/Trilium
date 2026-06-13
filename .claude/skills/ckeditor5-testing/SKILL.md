---
name: ckeditor5-testing
description: >-
  Write and run tests for CKEditor 5 plugins/features. Use when adding or
  reviewing unit tests for a ckeditor5-* package, debugging a failing test,
  migrating tests to Vitest, or setting up the test runner. Covers the current
  Vitest + Playwright browser setup, the test-editor utilities
  (ClassicTestEditor / VirtualTestEditor / ModelTestEditor), the model/view test
  helpers (_setModelData/_getModelData/_getViewData and their {}/[] selection
  syntax), vi spies/mocks, idiomatic patterns for schema/conversion/command/UI
  tests, the --files runner options, and migrating off the old Karma/Mocha/Chai
  setup. Complements the ckeditor5-plugin-development skill.
---

# CKEditor 5 testing

CKEditor 5 keeps a **complete unit-test suite with 100% code coverage per package**. Each
package owns its tests in `packages/ckeditor5-<name>/tests/`. Every code change should ship
with a test that proves it is needed.

> **Important — the published docs are out of date.** The official "Testing environment" guide
> describes **Karma + Mocha + Chai + Sinon**. The repository has **migrated to Vitest**
> (browser mode via Playwright). Write new/edited tests in the **Vitest** style described here;
> treat Chai/Sinon idioms (`expect().to.equal`, `sinon.spy`, `equalMarkup`) as legacy to be
> migrated, not copied. See `references/migration-from-karma.md`.

## When to use this skill

Adding/reviewing unit tests for a feature, debugging a failing test, migrating a legacy test
file to Vitest, or configuring the runner. For writing the feature itself, use the
`ckeditor5-plugin-development` skill.

## The current setup at a glance

- **Runner:** Vitest (`vitest@^4`), one **project per package**. Config comes from the root
  `createVitestConfig({ name: '<short-package-name>' })` factory; each package has a tiny
  `vitest.config.ts` that calls it.
- **Environment:** real browser via `@vitest/browser-playwright` (Chromium). Tests have real
  DOM APIs (`document.createElement`, etc.).
- **Globals:** `globals: true` is set, but migrated tests still **import explicitly** from
  `vitest` — do the same.
- **Test files:** `tests/**/*.{js,ts}`; excluded: `**/_utils`, `**/fixtures`, `**/manual`.
- **Setup:** `test_setup.js` sets `globalThis.CKEDITOR_GLOBAL_LICENSE_KEY = 'GPL'` — you do
  **not** pass a license key in tests.
- **Coverage:** `src/**` at **100%** thresholds (excludes `index.ts`, `augmentation.ts`,
  `*config.ts`). Provider `v8`.
- **TypeScript:** tests may be `.js` or `.ts`; import source with explicit `.js` extension
  (`../src/foo.js`).

## Running tests

Per-package (from the package dir) — the everyday loop:

```bash
vitest run                      # one-shot ("test" script)
vitest                          # watch / debug ("test:debug")
vitest run --browser.headless   # headless ("test:headless")
pnpm run coverage               # headless + coverage (100% gate)
vitest run paragraphcommand     # filter by file name substring
```

From the repo root, the dev-tools wrapper runs the suite and accepts `--files` patterns
(see `references/running-and-config.md`):

```bash
pnpm run test                       # ckeditor5-dev-tests-run-automated (wraps Vitest)
pnpm run test -- --files=paragraph  # one package (short name)
pnpm run test -- -c --files=core    # with coverage
```

`--files` rules (shared with manual tests): `core` or `ckeditor5-core` (a package),
`editor-*` (glob), `!core` / `!(core|engine)` (exclude), `engine/view/` (a sub-dir),
`basic-styles/bold*` (file glob), comma-separated sums.

## Anatomy of a test

```js
/**
 * @license Copyright (c) 2003-2026, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-licensing-options
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ModelTestEditor } from '@ckeditor/ckeditor5-core/tests/_utils/modeltesteditor.js';
import { _setModelData, _getModelData } from '@ckeditor/ckeditor5-engine';
import { ParagraphCommand } from '../src/paragraphcommand.js';

describe( 'ParagraphCommand', () => {
	let editor, model, command;

	beforeEach( () => {
		return ModelTestEditor.create().then( newEditor => {
			editor = newEditor;
			model = editor.model;
			command = new ParagraphCommand( editor );
			editor.commands.add( 'paragraph', command );
			model.schema.register( 'paragraph', { inheritAllFrom: '$block' } );
			model.schema.register( 'heading1', { inheritAllFrom: '$block' } );
		} );
	} );

	afterEach( () => {
		command.destroy();        // or editor.destroy() when you create a full editor
	} );

	it( 'is true when selection is in a paragraph', () => {
		_setModelData( model, '<paragraph>foo[]bar</paragraph>' );
		expect( command.value ).toBe( true );
	} );
} );
```

Conventions visible here and across the suite:
- Start with the **license header**. Keep one top-level `describe` named after the unit, with
  nested `describe`s for areas (`value`, `execute()`, …) and small focused `it`s.
- Create the editor in `beforeEach` (return the Promise — Vitest awaits it). **Always tear
  down** in `afterEach` (`editor.destroy()`, and remove any DOM element you appended).
- Use the lightest test editor that works: `ModelTestEditor` (model only) < `VirtualTestEditor`
  (model+engine, no DOM render) < `ClassicTestEditor` (full UI in a real element). Details in
  `references/test-utilities.md`.

## Model/view test data

`_setModelData()` / `_getModelData()` (and `_getViewData()`/`_setViewData()`) stringify and
parse the engine structures, with a special selection syntax:

- `[]` — collapsed selection, **or** brackets around a range, anchored in an **element**.
- `{}` — selection anchored inside a **text node** (e.g. `foo{}bar` / `f{oo}bar`).
- Attributes render as `<$text bold="true">word</$text>`; elements as `<paragraph>…</paragraph>`.

```js
_setModelData( model, '<paragraph>foo[]bar</paragraph>' );
expect( _getModelData( model ) ).toEqual( '<paragraph>foo[]bar</paragraph>' );
expect( _getViewData( editor.editing.view ) ).toEqual( '<p>foo{}bar</p>' );
```

These are dev/test utilities only — never ship them in production code.

## Assertions & spies (Vitest)

- Matchers: `expect(x).toBe()`, `.toEqual()`, `.toBeInstanceOf()`, `.toHaveBeenCalledOnce()`,
  `.toHaveBeenCalledWith()`, `.toThrow()`. There are **no** custom Chai matchers (`equalMarkup`,
  `.attribute`) — compare stringified model/view with `.toEqual()` instead.
- Spies/mocks via `vi`: `const spy = vi.spyOn( editor, 'execute' );` then
  `expect( spy ).toHaveBeenCalledWith( 'paragraph' )`. Also `vi.fn()`, `vi.useFakeTimers()`,
  `vi.stubGlobal()`. (Replaces Sinon — see the migration reference.)

```js
const spy = vi.spyOn( editor, 'execute' );
button.fire( 'execute' );
expect( spy ).toHaveBeenCalledOnce();
expect( spy ).toHaveBeenCalledWith( 'paragraph' );
```

## Reference map

| File | Use it for |
|------|-----------|
| `references/test-utilities.md` | The test editors (`ModelTestEditor`/`VirtualTestEditor`/`ClassicTestEditor`), other `_utils` (`articlepluginset`, `cleanup`, `generatelicensekey`), and the `_get/_set/_stringify/_parse` model & view helpers + selection syntax. |
| `references/patterns.md` | Idiomatic test recipes per concern: schema, conversion round-trips, commands (`value`/`isEnabled`/`execute`), UI (component factory, button binding, execute spy), keystrokes, events, async, and reaching 100% coverage. |
| `references/running-and-config.md` | Full runner reference: per-package vs. root wrapper, `--files` patterns, coverage/headless/watch, the `createVitestConfig` factory, browser mode, manual tests (md/js/html), memory-leak tests. |
| `references/migration-from-karma.md` | Mapping legacy Karma/Mocha/Chai/Sinon idioms to Vitest — for migrating existing test files (the repo is mid-migration). |

## Quick review checklist

When reviewing tests: license header present; explicit `vitest` imports; lightest suitable
test editor; editor/command created in `beforeEach` and **destroyed** in `afterEach` (plus DOM
cleanup); model/view asserted via `_getModelData`/`_getViewData` + `toEqual` with correct
`[]`/`{}` selection syntax; spies via `vi`; behavior covered for collapsed **and** ranged
selections and schema-disallowed contexts; new `src/` lines covered (100% gate); no Chai/Sinon
leftovers; manual tests (if any) under `tests/manual/`.
