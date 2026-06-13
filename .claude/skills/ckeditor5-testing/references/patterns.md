# Test patterns (Trilium, Vitest)

Idiomatic recipes per concern. All examples assume a real `ClassicEditor` created in `beforeEach`
and destroyed in `afterEach` (see `test-utilities.md`). Mirror the structure of the feature: an
`*editing` test for schema/conversion/command, a `*ui` test for buttons/dropdowns. Assertions may
be **Jest-style** (`toBe`/`toEqual`) or **Chai-style** (`to.equal`/`to.be.false`) — both work in
Vitest; the examples use Jest-style.

## Setup / teardown

```ts
import { ClassicEditor, Paragraph } from 'ckeditor5';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MyFeature from '../src/myfeature.js';

let editorElement: HTMLDivElement, editor: ClassicEditor, model;

beforeEach( async () => {
	editorElement = document.createElement( 'div' );
	document.body.appendChild( editorElement );
	editor = await ClassicEditor.create( editorElement, {
		licenseKey: 'GPL',
		plugins: [ Paragraph, MyFeature ]
	} );
	model = editor.model;
} );

afterEach( () => {
	editorElement.remove();
	return editor.destroy();
} );
```

Return the Promise (or use `async`/`await`) so Vitest waits. Default `testTimeout` is 5000 ms.

## Schema

```ts
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

Test each direction with the data helpers. Upcast = `setData` then read the model; data downcast =
`setModelData` then `getData`; editing downcast = read `_getViewData`.

```ts
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

For widgets, assert the editing view contains the widget classes/attributes (`ck-widget`,
`contenteditable`) while `getData()` stays clean. Widget rendering needs real layout — run such
tests in a **browser-mode** package, not happy-dom.

## Commands

Cover `value`, `isEnabled`, and `execute()` — for **collapsed and ranged** selections and for
**schema-disallowed** contexts (where `isEnabled` must be `false`). Instantiate the command
directly when convenient.

```ts
const command = new InsertMermaidCommand( editor );

describe( 'isEnabled', () => {
	it( 'is false when a mermaid element is selected', () => {
		_setModelData( model,
			'<paragraph>foo</paragraph>[<mermaid source="flowchart TB"></mermaid>]' );
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
} );
```

## UI (component factory, button binding, execute)

`editor.ui` exists on the real editor. Verify the factory produces the right view, the button
reflects command state, and clicking it runs the command. UI/balloon positioning needs real
layout — keep these in a **browser-mode** package.

```ts
it( 'registers a ButtonView', () => {
	expect( editor.ui.componentFactory.create( 'highlight' ) ).toBeInstanceOf( ButtonView );
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

```ts
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

(`keyCodes` from `'ckeditor5'`.) For view-document keydown handlers, fire on
`editor.editing.view.document`.

## Events & observables

```ts
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

## Errors / warnings

```ts
it( 'throws on invalid config', () => {
	expect( () => editor.something() ).toThrow( /my-feature-error/ );
} );
```

For `CKEditorError`, match the error id substring.

## Reaching 100% coverage (browser-mode packages)

Browser-mode packages (`footnotes`, `keyboard-marker`, `math`, `mermaid`) gate `src/**` at 100%
(lines/functions/branches/statements, provider `v8`). Every branch needs a test: both states of
each boolean, each schema-allowed/disallowed path, collapsed vs. ranged selection, and error/guard
branches. happy-dom packages (`admonition`, `collapsible`) have **no** threshold. Run the package's
`test` script and read the coverage text report to find uncovered lines before pushing.
