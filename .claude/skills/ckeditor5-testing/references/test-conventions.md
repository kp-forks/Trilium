# Trilium test conventions & gotchas

Trilium never used Karma/Mocha/Sinon — the plugin tests are Vitest from the start, so there is no
migration to do. This reference collects the Trilium-specific conventions and traps when writing
CKEditor 5 plugin tests.

## Choosing an environment: happy-dom vs. browser mode

Pick per package (set in the package's `vitest.config.ts`):

- **happy-dom** (`admonition`, `collapsible`) — fast, but **not a real browser**.
  `getBoundingClientRect()` returns zeros, layout is stubbed, `ResizeObserver` is stubbed. Good
  for model logic, schema, conversion, and command behavior that never measures the DOM.
- **WebdriverIO browser mode** (`footnotes`, `keyboard-marker`, `math`, `mermaid`) — real headless
  Chrome, real layout. Required for anything that measures or positions DOM: widget rendering,
  balloon/toolbar placement, focus, scrolling, `getBoundingClientRect`. Gates `src/**` at 100%
  coverage.

If a test depends on real measurements and the package is on happy-dom, it will silently get zero
sizes — move the package (or the test) to browser mode rather than working around stubs. The
general `writing-unit-tests` skill reserves `@vitest/browser` for exactly these real-layout needs
(CKEditor, Excalidraw).

## Real-editor lifecycle & teardown

There are **no** test-editor factories in Trilium. Create a real `ClassicEditor` over a real
element with `licenseKey: 'GPL'`, and always tear it down:

```ts
beforeEach( async () => {
	editorElement = document.createElement( 'div' );
	document.body.appendChild( editorElement );
	editor = await ClassicEditor.create( editorElement, {
		licenseKey: 'GPL', plugins: [ Paragraph, MyPlugin ]
	} );
} );

afterEach( () => {
	editorElement.remove();
	return editor.destroy();
} );
```

Forgetting `editor.destroy()` or `editorElement.remove()` leaks editor DOM / body wrappers across
tests and causes flakiness.

## Assertion styles — both work

Vitest accepts **Jest-style** and **Chai-style** matchers, and the existing Trilium tests mix
them freely. Use whichever fits; don't "convert" one to the other for its own sake.

| Chai-style | Jest-style |
|------------|------------|
| `expect( x ).to.equal( y )` | `expect( x ).toBe( y )` |
| `expect( x ).to.deep.equal( y )` | `expect( x ).toEqual( y )` |
| `expect( x ).to.be.true` / `.false` | `expect( x ).toBe( true )` / `toBe( false )` |
| `expect( x ).to.instanceOf( C )` | `expect( x ).toBeInstanceOf( C )` |
| `expect( x ).to.throw( /re/ )` | `expect( x ).toThrow( /re/ )` |

There are **no** custom matchers (`equalMarkup`, `.attribute`) — compare stringified model/view
directly: `expect( _getModelData( model ) ).toEqual( '<paragraph>…</paragraph>' )`.

## Helpers & imports

- Import `_setModelData`, `_getModelData`, `_getViewData` (and editor classes, `keyCodes`, etc.)
  from `'ckeditor5'`. In-package source imports use a file extension (`../src/foo.js`).
- Spies/mocks via `vi` (`vi.spyOn` / `vi.fn` / `vi.useFakeTimers`).
- Test files: `tests/**/*.[jt]s`, no `.spec`/`.test` suffix.

## Running math & mermaid

`math` and `mermaid` run **sequentially** at the root (`pnpm test:sequential`) because each spins
up headless Chrome and they exhaust resources if run in parallel. Other packages run via
`pnpm test:parallel`. When running a single package, use `pnpm --filter @triliumnext/ckeditor5-<name> test`.

## See also

For general (non-CKEditor) Trilium testing — Preact components, jQuery widgets, client services,
server routes — use the `writing-unit-tests` skill, which also documents happy-dom's limits and
when to reach for `@vitest/browser`.
