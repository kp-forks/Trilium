# Migrating tests: Karma/Mocha/Chai/Sinon → Vitest

The repo is mid-migration (recent commits migrate packages one by one to Vitest). Many test
files still use the old stack. When you touch a legacy test, migrate it. This is the mapping.

## Imports & globals

- **Add explicit imports** at the top: `import { describe, it, expect, beforeEach, afterEach,
  vi } from 'vitest';` (the old globals from Mocha/Chai are gone; `globals: true` is set but the
  codebase imports explicitly).
- Keep the **license header** comment.
- Source imports use the **`.js` extension**: `import { Foo } from '../src/foo.js';`.
- Drop any `import { expect } from 'chai'` / Chai plugin setup.

## Test structure

- `describe`/`it`/`beforeEach`/`afterEach` keep the same names and semantics — usually no change
  beyond importing them.
- Async setup: returning a Promise still works; `async`/`await` is fine too.

## Assertions: Chai → Vitest `expect`

| Chai (old) | Vitest (new) |
|------------|--------------|
| `expect( x ).to.equal( y )` | `expect( x ).toBe( y )` |
| `expect( x ).to.deep.equal( y )` | `expect( x ).toEqual( y )` |
| `expect( x ).to.be.true` / `.false` | `expect( x ).toBe( true )` / `toBe( false )` |
| `expect( x ).to.be.null` / `.undefined` | `expect( x ).toBeNull()` / `toBeUndefined()` |
| `expect( x ).to.be.instanceOf( C )` | `expect( x ).toBeInstanceOf( C )` |
| `expect( arr ).to.have.length( n )` | `expect( arr ).toHaveLength( n )` |
| `expect( x ).to.include( y )` | `expect( x ).toContain( y )` |
| `expect( fn ).to.throw( /re/ )` | `expect( fn ).toThrow( /re/ )` |
| `expect( x ).to.exist` | `expect( x ).toBeTruthy()` (or `toBeDefined()`) |

### Custom CKEditor Chai assertions (removed)

The old Karma setup auto-loaded custom Chai matchers. They **do not exist** in Vitest:

- `expect( a ).to.equalMarkup( b )` → compare stringified structures directly:
  `expect( _getModelData( model ) ).toEqual( '<paragraph>…</paragraph>' )` (use
  `_getModelData`/`_getViewData`/`_stringifyModel`). The diff is on strings.
- `expect( selection ).to.have.attribute( 'linkHref', 'x' )` → assert explicitly:
  `expect( selection.hasAttribute( 'linkHref' ) ).toBe( true )` and
  `expect( selection.getAttribute( 'linkHref' ) ).toBe( 'x' )`.

## Spies/stubs/mocks: Sinon → `vi`

| Sinon (old) | Vitest (new) |
|-------------|--------------|
| `sinon.spy( obj, 'm' )` | `vi.spyOn( obj, 'm' )` |
| `sinon.stub( obj, 'm' ).returns( v )` | `vi.spyOn( obj, 'm' ).mockReturnValue( v )` |
| `sinon.stub( obj, 'm' ).callsFake( fn )` | `vi.spyOn( obj, 'm' ).mockImplementation( fn )` |
| `sinon.spy()` / `sinon.stub()` | `vi.fn()` |
| `spy.calledOnce` | `expect( spy ).toHaveBeenCalledOnce()` |
| `spy.calledWith( a )` | `expect( spy ).toHaveBeenCalledWith( a )` |
| `spy.called` | `expect( spy ).toHaveBeenCalled()` |
| `spy.callCount` | `expect( spy ).toHaveBeenCalledTimes( n )` |
| `spy.returned( v )` / `spy.args` | `spy.mock.results` / `spy.mock.calls` |
| `sinon.useFakeTimers()` | `vi.useFakeTimers()` (+ `vi.advanceTimersByTime()`, `vi.useRealTimers()`) |
| `clock.tick( n )` | `vi.advanceTimersByTime( n )` |

### The Sinon sandbox helper (remove it)

Legacy tests use `testUtils.createSinonSandbox()` + `testUtils.sinon.*` (from a `_utils/utils`
module). Replace with plain `vi`:

```js
// OLD
testUtils.createSinonSandbox();
it( '…', () => { testUtils.sinon.spy( obj, 'm' ); } );

// NEW — no sandbox; mocks auto-restore, or restore explicitly:
import { vi, afterEach } from 'vitest';
afterEach( () => vi.restoreAllMocks() );      // optional safety
it( '…', () => { vi.spyOn( obj, 'm' ); } );
```

## Environment differences

- Tests run in a **real browser** (Playwright Chromium), not jsdom — real DOM/layout APIs are
  available; code that depended on Karma+webpack globals may need adjusting.
- No `licenseKey` in test editors — `test_setup.js` sets the global GPL key.
- `.svg` imports resolve to the SVG **string** (via the config's `load-svg` plugin), same as
  before.

## Checklist for a migrated file

- [ ] License header kept; explicit `vitest` imports added.
- [ ] All `import … from 'chai'` / `sinon` removed; `.js` extensions on source imports.
- [ ] Chai matchers → Vitest matchers; `equalMarkup`/`.attribute` rewritten with data helpers.
- [ ] Sinon → `vi`; sandbox removed.
- [ ] Editor/command still created in `beforeEach` and **destroyed** in `afterEach` (+ DOM
      cleanup); appended elements removed.
- [ ] `vitest run` passes and `pnpm run coverage` still hits 100% for the package.
