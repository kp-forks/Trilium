# UI library & localization

The UI library (`@ckeditor/ckeditor5-ui`) is a small MVC: **Views** render DOM via
**Templates**, expose **observable** properties, and are organized into **collections** that
form the UI tree. Features talk to views through observables — never the native DOM directly.

## Views & templates

A `View` builds its DOM with `setTemplate()` and exposes observable state via `set()`:

```js
import { View } from 'ckeditor5';

class SimpleInputView extends View {
	constructor( locale ) {
		super( locale );
		const bind = this.bindTemplate;            // bind observables → DOM
		this.set( { isEnabled: false, placeholder: '' } );
		this.setTemplate( {
			tag: 'input',
			attributes: {
				class: [ 'foo', bind.if( 'isEnabled', 'ck-enabled' ) ],
				placeholder: bind.to( 'placeholder' ),
				type: 'text'
			},
			on: { keydown: bind.to( 'input' ) }     // DOM event → view 'input' event
		} );
	}
	setValue( v ) { this.element.value = v; }       // owned DOM access lives in the view
}
```

Rules & best practices:
- **Always pass `locale`** to view/component constructors.
- A standalone view must be `render()`ed before injecting `view.element` into the DOM; child
  views added to a collection are rendered/destroyed by the editor automatically.
- **Encapsulate the DOM**: features set view observables or `bind()` to them; never write
  `view.element.placeholder = …` directly (it collides with bindings).
- Template supports `tag`, `attributes` (incl. `class` arrays, `style` objects),
  `children` (views/strings/collections), and `on` event bindings. `bind.to(prop)` /
  `bind.if(prop, value, callback)` wire observables; templates also forward DOM events.
- Create child collections with `this.createCollection([...])`; the UI tree has no depth limit.

## View collections & the UI tree

Each editor UI has a root view at `editor.ui.view`. A `BoxedEditorUIView` exposes `top`
(toolbar), `main` (editable), and inherited `body` (floating elements in `<body>`). Plugins
add views into these collections so they're managed (initialized/destroyed) with the editor:

```js
class MyPlugin extends Plugin {
	init() { this.editor.ui.top.add( new MyPluginView() ); }
}
```

## Registering toolbar components

Register every toolbar/UI component in the **component factory**; the user references the name
in their `toolbar` config:

```js
editor.ui.componentFactory.add( 'myButton', locale => {
	const button = new ButtonView( locale );
	button.set( { label: editor.t( 'My button' ), withText: true } );
	button.on( 'execute', () => { editor.execute( 'myCommand' ); editor.editing.view.focus(); } );
	return button;
} );
// user config: toolbar: [ 'myButton' ]
```

**Best practice:** on any user action (button/dropdown execute), call
`editor.editing.view.focus()` so the editor keeps focus.

## Component catalog

| Component | Purpose / key props |
|-----------|---------------------|
| `ButtonView` | `label`, `withText`, `icon`, `tooltip`, `tooltipPosition`, `isOn`, `isEnabled`, `isToggleable`, `keystroke`, `withKeystroke`, `class`; fires `execute`. |
| `SwitchButtonView` | Toggle button; flips `isOn`; bind to a toggle command's `value`/`isEnabled`. |
| `DropdownButtonView` / `SplitButtonView` | Dropdown trigger buttons; `SplitButtonView` exposes `actionView` (main region). |
| `DropdownView` | Created via `createDropdown(locale[, SplitButtonView])`; has `buttonView` + `panelView`. |
| `ToolbarView` | `items` collection; `isCompact`; `ToolbarSeparatorView`, `ToolbarLineBreakView` for layout. |
| `LabeledFieldView` | Input + label: `new LabeledFieldView(locale, createLabeledInputText | createLabeledInputNumber)`; `fieldView.element.value`. |
| `InputTextView` / `TextareaView` | Raw inputs; `TextareaView` has `minRows`, `maxRows`, `resize`. |
| `SearchTextView` / `AutocompleteView` | Search/filter UIs (filtered view must implement `.filter()`/`.focus()`). |
| `IconView` | SVG display; `iconView.content = IconBold`. |
| `SpinnerView` | Loading spinner; `isVisible`. |
| `BalloonPanelView` | Low-level floating panel (`.pin({target, positions})`). Usually use `ContextualBalloon`. |
| `View` + `setTemplate` | Arbitrary custom UI / dialog content. |

## Icons

Import from the bundle (sourced from `@ckeditor/ckeditor5-icons`) and assign to a view's
`icon`/`content`:

```js
import { IconBold, IconCheck, IconCancel, IconQuote } from 'ckeditor5';
button.set( { icon: IconBold } );
```

Custom icons: pass the full SVG XML string. For a recolorable icon, strip `fill`/`stroke`
attributes from the SVG.

## Dropdowns

Use `createDropdown` + the appropriate `add…ToDropdown` helper; don't compose from scratch
unless necessary. Default dropdowns auto-close on blur and on `execute`, and focus their panel
content for keyboard nav.

```js
import { createDropdown, addListToDropdown, addToolbarToDropdown, addMenuToDropdown,
         SplitButtonView, UIModel, Collection } from 'ckeditor5';

const dropdown = createDropdown( locale );
dropdown.buttonView.set( { label: 'Label', withText: true, tooltip: true, icon } );

// List dropdown
const items = new Collection();
items.add( { type: 'button', model: new UIModel( { label: 'Foo', withText: true, commandParam: 'foo' } ) } );
addListToDropdown( dropdown, items );
dropdown.on( 'execute', evt => editor.execute( 'cmd', { value: evt.source.commandParam } ) );

// Toolbar dropdown (split button)
const dd2 = createDropdown( locale, SplitButtonView );
addToolbarToDropdown( dd2, [ buttonA, buttonB ] );
dd2.bind( 'isEnabled' ).toMany( [ buttonA, buttonB ], 'isEnabled', ( ...e ) => e.some( Boolean ) );

// Menu dropdown
addMenuToDropdown( dropdown, editor.body.ui.view, [
	{ id: 'menu_1', menu: 'Menu 1', children: [ { id: 'a', label: 'Item A' } ] },
	{ id: 'top_a', label: 'Top Item A' }
] );
```

Even when `withText` is false, set `label` for screen readers.

## Contextual balloon

For floating forms/toolbars pinned to the selection, use the `ContextualBalloon` plugin
(only one visible view at a time). Pattern from the abbreviation feature:

```js
import { ContextualBalloon, clickOutsideHandler } from 'ckeditor5';

static get requires() { return [ ContextualBalloon ]; }

init() {
	this._balloon = this.editor.plugins.get( ContextualBalloon );
	this.formView = this._createFormView();
}
_showUI() {
	this._balloon.add( { view: this.formView, position: this._getBalloonPositionData() } );
	this.formView.focus();
}
_getBalloonPositionData() {
	const view = this.editor.editing.view;
	return { target: () => view.domConverter.viewRangeToDom( view.document.selection.getFirstRange() ) };
}
_hideUI() { this._balloon.remove( this.formView ); this.editor.editing.view.focus(); }

// Hide on outside click:
clickOutsideHandler( {
	emitter: formView,
	activator: () => this._balloon.visibleView === formView,
	contextElements: [ this._balloon.view.element ],
	callback: () => this._hideUI()
} );
```

A custom form view extends `View`, builds inputs via `LabeledFieldView`, groups children in a
collection, uses `submitHandler({ view: this })` in `render()` to turn native submit into a
`submit` event, delegates button events (`cancelButtonView.delegate('execute').to(this,'cancel')`),
and exposes a `focus()` method. Add `tabindex: '-1'` and the `ck` class to UI roots.

## Dialogs & modals

The `Dialog` plugin shows views in a dialog (`isModal: false`) or modal (`isModal: true`,
blocks page interaction). Only one open at a time.

```js
const dialog = editor.plugins.get( 'Dialog' );
dialog.show( {
	id: 'myDialog',
	isModal: true,
	title: 'My dialog',
	icon: IconPencil,          // header icon (optional)
	hasCloseButton: true,      // default true when icon/title present
	content: someView,         // a View or collection of Views
	position: DialogViewPosition.EDITOR_BOTTOM_CENTER, // optional
	actionButtons: [
		{ label: 'OK', class: 'ck-button-action', withText: true, onExecute: () => dialog.hide() },
		{ label: 'Cancel', withText: true, onExecute: () => dialog.hide() }
	],
	onShow: dlg => { /* set listeners/initial values */ },
	onHide: dlg => { /* reset state */ }
} );
dialog.hide();
```

- Lifecycle events: `show` / `show:[id]`, `hide` / `hide:[id]` (on the plugin), and the
  view's `close` event (`data.source === 'escKeyPress'`). Listen to customize position or
  block Esc — but **always leave a way to close**; never trap users.
- Action buttons support `onCreate(buttonView)` and `onExecute()`; bind button `isEnabled` to
  content state to require user actions.
- `dialog.view.updatePosition()` re-applies the configured default position.
- Full keyboard a11y: Ctrl+F6 moves focus editor↔dialog; Esc closes; Tab/Shift+Tab navigate.

## Focus & keystroke management

Build accessible UI with these utility classes (see the abbreviation level-3 feature):

- `FocusTracker` — observes elements and exposes observable `isFocused` / `focusedElement`.
  `focusTracker.add( view.element )`.
- `KeystrokeHandler` — runs actions for keystrokes within a scope. `keystrokes.listenTo(el)`;
  `keystrokes.set( 'Tab', ( data, cancel ) => { …; cancel(); }, { priority } )`. Each view
  typically owns one.
- `FocusCycler` — cycles focus across a collection of focusables (Tab/Shift+Tab):
  `new FocusCycler( { focusables, focusTracker, keystrokeHandler, actions: { focusPrevious: 'shift + tab', focusNext: 'tab' } } )`.
- **Destroy** `focusTracker` and `keystrokes` in the view's `destroy()` to avoid leaks.

Editor-level keystrokes bind to commands directly via `EditingKeystrokeHandler`:

```js
editor.keystrokes.set( 'Ctrl+Alt+H', 'highlight' );        // command name
editor.keystrokes.set( 'Ctrl+Alt+H', ( evt, cancel ) => { editor.execute( 'highlight' ); cancel(); } );
```

Register shortcuts in the a11y help dialog and the button tooltip:

```js
const t = editor.t;
editor.accessibility.addKeystrokeInfos( {
	keystrokes: [ { label: t( 'Highlight text' ), keystroke: 'Ctrl+Alt+H' } ]
} );
button.set( { /* … */ keystroke: 'Ctrl+Alt+H' } );          // shows in tooltip
```

Keys map to platform conventions automatically (e.g. `Ctrl` → `Cmd` on macOS).

## Localization with `t()`

Every user-facing string must pass through the `t()` function so it can be translated.

- Get it from the locale: `const { t } = editor.locale;` or `const t = editor.t;` or, in a
  view, `const t = this.t;`. (`editor.locale.t` is also `editor.t`.)
- **Static-analysis constraints:** in **JS files** the analyzer only recognizes a function
  named exactly `t()` — don't rename it or call `locale.t()` directly. In **TS files** direct
  `Locale#t()` calls (`editor.t()`, `locale.t()`, `this.t()`) are also recognized. The first
  arg must be a **string or object literal** — never a variable.

```js
t( 'Insert emoji' );                                   // simple
t( 'Insert %0 emoji', emojiName );                     // placeholder; array also ok
t( { string: '%0 emoji', plural: '%0 emojis', id: 'N_EMOJIS' }, quantity ); // plural; first value = quantity
t( { string: '%0 emoji', id: 'ACTION_EMOJI' }, 'insert' );                  // disambiguating id
```

- **Reuse a translation** from another package without creating a new source message by
  aliasing the locale function: `const translateVariableKey = editor.locale.t;`
  `translateVariableKey( 'Block quote' )` reuses; `t( 'Create a block quote' )` is a new message.
- Ship translations as `.po` files in `lang/translations/` (preferred for packages — bundles
  only needed languages), or at runtime via the `add()` helper / `window.CKEDITOR_TRANSLATIONS`
  (extend with `Object.assign` to avoid clobbering). New languages need a `getPluralForm()`.
- Limitations: language can't change at runtime without re-creating the editor; the webpack
  plugin bundles one language at a time. Third-party packages localizing via `.po` must
  override `sourceFilesPattern`/`packageNamePattern` so the build tool scans their code.
