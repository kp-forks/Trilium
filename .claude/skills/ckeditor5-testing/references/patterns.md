# Test patterns (Vitest)

Idiomatic recipes per concern. All examples assume explicit `vitest` imports and a test editor
created in `beforeEach`, destroyed in `afterEach`. Mirror the structure of the feature: a
`*editing` test for schema/conversion/command, a `*ui` test for buttons/dropdowns.

## Setup / teardown

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let editor, model;

beforeEach( () => {
	return VirtualTestEditor.create( { plugins: [ Paragraph, MyFeature ] } )
		.then( newEditor => { editor = newEditor; model = editor.model; } );
} );

afterEach( () => editor.destroy() );   // + element.remove() for ClassicTestEditor
```

Return the Promise (or use `async`/`await`) so Vitest waits. Default `testTimeout` is 5000 ms.

## Schema

```js
it( 'allows the highlight attribute on $text', () => {
	expect( model.schema.checkAttribute( [ '$root', '$text' ], 'highlight' ) ).toBe( true );
} );

it( 'registers placeholder as an inline object', () => {
	expect( model.schema.isRegistered( 'placeholder' ) ).toBe( true );
	expect( model.schema.isInline( 'placeholder' ) ).toBe( true );
	expect( model.schema.checkChild( [ '$root', '$block' ], 'placeholder' ) ).toBe( true );
} );
```

## Conversion (round-trips)

Test each direction with the data helpers. Upcast = `setData` then read the model; data
downcast = `setData`/`setModelData` then `getData`; editing downcast = read `_getViewData`.

```js
it( 'upcasts <mark> to the highlight attribute', () => {
	editor.setData( '<p>foo <mark>bar</mark></p>' );
	expect( _getModelData( model, { withoutSelection: true } ) )
		.toEqual( '<paragraph>foo <$text highlight="true">bar</$text></paragraph>' );
} );

it( 'data-downcasts the highlight attribute to <mark>', () => {
	_setModelData( model, '<paragraph>foo <$text highlight="true">bar</$text></paragraph>' );
	expect( editor.getData() ).toEqual( '<p>foo <mark>bar</mark></p>' );
} );

it( 'editing-downcasts to <mark> in the editing view', () => {
	_setModelData( model, '<paragraph>foo <$text highlight="true">bar</$text></paragraph>' );
	expect( _getViewData( editor.editing.view, { withoutSelection: true } ) )
		.toEqual( '<p>foo <mark>bar</mark></p>' );
} );
```

For widgets, assert the editing view contains the widget classes/attributes
(`ck-widget`, `contenteditable`) while `getData()` stays clean.

## Commands

Cover `value`, `isEnabled`, and `execute()` — for **collapsed and ranged** selections and for
**schema-disallowed** contexts (where `isEnabled` must be `false`).

```js
describe( 'value', () => {
	it( 'reflects the current selection state', () => {
		_setModelData( model, '<paragraph>[]foo</paragraph>' );
		expect( command.value ).toBe( false );
		_setModelData( model, '<paragraph><$text highlight="true">[]foo</$text></paragraph>' );
		expect( command.value ).toBe( true );
	} );
} );

describe( 'isEnabled', () => {
	it( 'is false where the attribute is disallowed', () => {
		_setModelData( model, '<imageBlock></imageBlock>' );   // selection on object
		expect( command.isEnabled ).toBe( false );
	} );
} );

describe( 'execute()', () => {
	it( 'applies the attribute to a ranged selection', () => {
		_setModelData( model, '<paragraph>[foobar]</paragraph>' );
		command.execute();
		expect( _getModelData( model ) )
			.toEqual( '<paragraph>[<$text highlight="true">foobar</$text>]</paragraph>' );
	} );

	it( 'is undoable as a single step', () => {
		_setModelData( model, '<paragraph>[foobar]</paragraph>' );
		command.execute();
		editor.execute( 'undo' );
		expect( _getModelData( model ) ).toEqual( '<paragraph>[foobar]</paragraph>' );
	} );
} );
```

## UI (component factory, button binding, execute)

Use `ClassicTestEditor` so `editor.ui` exists. Verify the factory produces the right view, the
button reflects command state, and clicking it runs the command.

```js
it( 'registers a ButtonView', () => {
	expect( editor.ui.componentFactory.create( 'highlight' ) ).toBeInstanceOf( ButtonView );
} );

it( 'binds button state to the command', () => {
	const button = editor.ui.componentFactory.create( 'highlight' );
	const command = editor.commands.get( 'highlight' );
	command.isEnabled = false;
	expect( button.isEnabled ).toBe( false );
} );

it( 'executes the command on click and refocuses the editor', () => {
	const button = editor.ui.componentFactory.create( 'highlight' );
	const executeSpy = vi.spyOn( editor, 'execute' );
	const focusSpy = vi.spyOn( editor.editing.view, 'focus' );
	button.fire( 'execute' );
	expect( executeSpy ).toHaveBeenCalledWith( 'highlight' );
	expect( focusSpy ).toHaveBeenCalledOnce();
} );
```

For dropdowns, `create()` the component, inspect `dropdownView.listView`/`buttonView`, fire
`execute` on items, and assert the command ran with the expected `value`/`commandParam`.

## Keystrokes

```js
it( 'executes the command on Ctrl+Alt+H', () => {
	const spy = vi.spyOn( editor, 'execute' );
	const wasHandled = editor.keystrokes.press( {
		keyCode: keyCodes.h, ctrlKey: true, altKey: true,
		preventDefault: () => {}, stopPropagation: () => {}
	} );
	expect( spy ).toHaveBeenCalledWith( 'highlight' );
	expect( wasHandled ).toBe( true );
} );
```

(`keyCodes` from `@ckeditor/ckeditor5-utils`.) For view-document keydown handlers, fire on
`editor.editing.view.document`.

## Events & observables

```js
it( 'fires change:value', () => {
	const spy = vi.fn();
	command.on( 'change:value', spy );
	_setModelData( model, '<paragraph><$text highlight="true">[]x</$text></paragraph>' );
	expect( spy ).toHaveBeenCalled();
} );
```

## Spies, mocks, timers

- `vi.spyOn( obj, 'method' )` — wrap and observe (optionally `.mockImplementation(...)`).
- `vi.fn()` — standalone mock callback.
- `vi.useFakeTimers()` / `vi.advanceTimersByTime()` / `vi.useRealTimers()` — for debounced or
  timeout-based code; restore in `afterEach`.
- `vi.stubGlobal( 'name', value )` — stub a global. Prefer `vi.restoreAllMocks()` in `afterEach`
  if you don't rely on auto-restore.

## Errors / warnings

```js
it( 'throws on invalid config', () => {
	expect( () => editor.something() ).toThrow( /my-feature-error/ );
} );
```

For `CKEditorError`, match the error id substring.

## Reaching 100% coverage

The suite gates `src/**` at 100% (excluding `index.ts`, `augmentation.ts`, `*config.ts`). Every
branch needs a test: both states of each boolean, each schema-allowed/disallowed path, collapsed
vs. ranged selection, and error/guard branches. Run `pnpm run coverage` (headless + v8) and read
the HTML report to find uncovered lines before pushing.
