# Canonical patterns from the core plugins

> **Source paths below (`packages/ckeditor5-…/src/…`) point into the upstream CKEditor 5 repository
> ([github.com/ckeditor/ckeditor5](https://github.com/ckeditor/ckeditor5)), not your project.** They
> show where each idiom lives in the library's own source. Your plugin imports CKEditor from the
> `ckeditor5` / `@ckeditor/*` npm packages; don't try to open these as local files.

Real-world idioms mined from the actual upstream `packages/*/src` source (verified against the
library at the baseline commit). These go beyond the tutorials and are the patterns the official
plugins actually use. Each item cites its source file in the upstream repository.

**Downstream imports.** The snippets keep the symbol names but, in your own project, import them all
from the single **`ckeditor5`** package — e.g. `import { Plugin, ButtonView,
MenuBarMenuListItemButtonView, AttributeCommand, TwoStepCaretMovement, findAttributeRange,
inlineHighlight, Widget, toWidget, WidgetToolbarRepository } from 'ckeditor5';`. Where a snippet
shows an `@ckeditor/ckeditor5-*` or relative `../utils.js` import (the library's internal style),
treat it as a pointer to where the symbol lives, not the path you'd write downstream.

## Toolbar + menu-bar button in one factory

Official feature-UI plugins register **both** a toolbar button and a menu-bar item from a single
shared factory, using the `menuBar:` name prefix. The button binds to the command and refocuses
the editor on execute.

```ts
// Source: packages/ckeditor5-basic-styles/src/{bold/boldui.ts, utils.ts}
import { ButtonView, MenuBarMenuListItemButtonView } from 'ckeditor5';
// The shared factory is the library's internal helper; downstream import it as
// `_getBasicStylesButtonCreator` from 'ckeditor5', or write the ~12-line factory yourself.
import { _getBasicStylesButtonCreator as getButtonCreator } from 'ckeditor5';

const createButton = getButtonCreator( {
	editor, commandName: 'bold', plugin: this,
	icon: IconBold, label: t( 'Bold' ), keystroke: 'CTRL+B'
} );

editor.ui.componentFactory.add( 'bold', () => createButton( ButtonView ) );
editor.ui.componentFactory.add( 'menuBar:bold', () => createButton( MenuBarMenuListItemButtonView ) );
```

The factory (`packages/ckeditor5-basic-styles/src/utils.ts`, exported as
`_getBasicStylesButtonCreator`) does: `view.set({ label, icon, keystroke, isToggleable: true })`,
`view.bind('isEnabled').to(command,'isEnabled')`, `view.bind('isOn').to(command,'value')`, sets
`role: 'menuitemcheckbox'` for the menu-bar variant or `tooltip: true` for the toolbar variant,
and on `execute` runs the command + `editor.editing.view.focus()`.

- **Menu bar** is registered with the `menuBar:<name>` component name; `MenuBarMenuListItemButtonView`
  is pre-set with `withText: true`, `withKeystroke: true`, `tooltip: false`, `role: 'menuitem'`.
- `SwitchButtonView` auto-sets `isToggleable`. `FileDialogButtonView` fires a `done` event with a
  `FileList` (`acceptedType`, `allowMultipleFiles`) — use for file pickers
  (`packages/ckeditor5-ui/src/button/filedialogbuttonview.ts`).
- `componentFactory` API: `add(name, locale => view)`, `create(name)`, `has(name)`, `names()`;
  names are case-insensitive; views are created fresh per `create()`.

## Glue plugin flags & TS dependency typing

```ts
// packages/ckeditor5-basic-styles/src/bold.ts
export class Bold extends Plugin {
	public static get requires(): PluginDependenciesOf<[ BoldEditing, BoldUI ]> {
		return [ BoldEditing, BoldUI ];
	}
	public static get pluginName() { return 'Bold' as const; }
	public static override get isOfficialPlugin(): true { return true; }   // first-party marker
}
```

- `isOfficialPlugin` / `isPremiumPlugin` are licensing/telemetry flags (default `false`); set them
  with the exact `: true` return type or omit entirely (`ckeditor-plugin-flags` ESLint rule).
- `requires()` may list classes **or** plugin-name strings; order = load order.
- A `Command` must never go in `config.plugins` (it throws) — register with `editor.commands.add()`.

## augmentation.ts (typed plugins/commands/config)

```ts
// packages/ckeditor5-<feature>/src/augmentation.ts
declare module '@ckeditor/ckeditor5-core' {
	interface PluginsMap { [ Bold.pluginName ]: Bold; }
	interface CommandsMap { bold: AttributeCommand; }
	interface EditorConfig { myFeature?: MyFeatureConfig; }
}
```

`index.ts` ends with `import './augmentation.js';` so the type maps register on import. Without it,
`editor.plugins.get('Bold')`, `editor.commands.get('bold')`, and `config.get('myFeature')` are
untyped. (See also `tooling-and-packaging.md`.)

## Reusable AttributeCommand + setAttributeProperties

Inline-style features don't hand-roll the command — they reuse `AttributeCommand` and tag the
attribute as formatting so it behaves natively (copied on Enter, replicated on paste).

```ts
// packages/ckeditor5-basic-styles/src/bold/boldediting.ts
editor.model.schema.extend( '$text', { allowAttributes: 'bold' } );
editor.model.schema.setAttributeProperties( 'bold', { isFormatting: true, copyOnEnter: true } );
editor.conversion.attributeToElement( { model: 'bold', view: 'strong', upcastAlso: [ 'b', /* … */ ] } );
editor.commands.add( 'bold', new AttributeCommand( editor, 'bold' ) );  // exported from basic-styles
```

`AttributeCommand` (`packages/ckeditor5-basic-styles/src/attributecommand.ts`): `refresh()` sets
`value` from the first allowed node and `isEnabled = schema.checkAttributeInSelection(...)`;
`execute({ forceValue })` toggles via `getValidRanges(..., { includeEmptyRanges: true })` and sets
the **selection attribute** on collapsed selections. `setAttributeProperties` flags:
`isFormatting` (replicated like native formatting), `copyOnEnter` (persists across Enter).

## Inline attributes at boundaries (links pattern)

For attributes that wrap text and need correct caret behavior at their edges:

```ts
// packages/ckeditor5-link/src/linkediting.ts
import { TwoStepCaretMovement, inlineHighlight } from 'ckeditor5'; // source: @ckeditor/ckeditor5-typing

editor.plugins.get( TwoStepCaretMovement ).registerAttribute( 'linkHref' );   // caret stops at edges
inlineHighlight( editor, 'linkHref', 'a', 'ck-link_selected' );               // class when caret inside

// packages/ckeditor5-link/src/linkcommand.ts
import { findAttributeRange } from 'ckeditor5'; // source: @ckeditor/ckeditor5-typing
const linkRange = findAttributeRange( position, 'linkHref', linkHref, model ); // whole same-value run
```

- `TwoStepCaretMovement` (require it; `registerAttribute(key)`) gives the two-press-to-exit caret.
- `findAttributeRange(position, key, value, model)` returns the full contiguous range carrying the
  same attribute value — use it to edit/replace the whole link under a collapsed caret.
- `inlineHighlight(editor, key, viewTag, className)` toggles a class while the selection is inside.

## AttributeElement priority & decorator converters

Downcasting attributes to nested inline elements (e.g. link + decorators) uses **attribute element
priority** so wrappers nest predictably:

```ts
// link manual decorator (packages/ckeditor5-link/src/linkediting.ts)
const a = conversionApi.writer.createAttributeElement( 'a', decorator.attributes, { priority: 5 } );
// then writer.wrap()/unwrap() the toViewRange, after consumable.consume(item, evt.name)
```

Higher-priority attribute elements nest **inside** lower/default-priority ones. Manual converters
must `conversionApi.consumable.consume(item, evt.name)` (and `.test()` first) before writing, or
they double-process — `false` means another converter already claimed it
(`packages/ckeditor5-image/src/image/converters.ts`).

## elementToStructure + slots (block widget wrapping content)

When a widget wraps editable/model children in extra view structure (image figure + caption):

```ts
// packages/ckeditor5-image/src/image/imageblockediting.ts (+ image/utils.ts)
conversion.for( 'editingDowncast' ).elementToStructure( {
	model: 'imageBlock',
	view: ( modelElement, { writer } ) => {
		const figure = writer.createContainerElement( 'figure', { class: 'image' } );
		writer.insert( writer.createPositionAt( figure, 0 ), writer.createEmptyElement( 'img' ) );
		writer.insert( writer.createPositionAt( figure, 'end' ), writer.createSlot( 'children' ) );
		return toImageWidget( figure, writer, t( 'image widget' ) );
	}
} );
```

`writer.createSlot()` marks where model children render; `'children'` = all, or pass a filter
callback `node => node.is('element','caption')` for specific children. Slots follow model child
order. Use `createEmptyElement` for voids (`img`), `createContainerElement` for containers.

## Reconversion (re-run downcast on attribute change)

A plain `elementToElement`/`elementToStructure` won't re-run when an attribute changes. Declare the
attributes in the model matcher to auto-reconvert, or reconvert manually:

```ts
conversion.for( 'downcast' ).elementToElement( {
	model: { name: 'tableCell', attributes: [ 'headingRows' ] },   // re-runs when headingRows changes
	view: ( el, { writer } ) => writer.createContainerElement( 'td' )
} );

editor.editing.reconvertItem( item );   // manual full re-downcast (editingcontroller.ts)
```

Use when the *tag/structure* depends on an attribute (e.g. `td`↔`th`). Reconvert the parent when a
child-count change affects the parent's rendering.

## Floating selection toolbar (BalloonToolbar)

The `BalloonToolbar` plugin shows a toolbar over a non-collapsed selection (Medium-style). Items
come from the `balloonToolbar` config; it fills from the component factory and pins to the
selection rect.

```ts
// usage
ClassicEditor.create( el, { plugins: [ /* … */ ], balloonToolbar: [ 'bold', 'italic', 'link' ] } );

// internals: packages/ckeditor5-ui/src/toolbar/balloon/balloontoolbar.ts
static get requires() { return [ ContextualBalloon ]; }
this._balloonConfig = normalizeToolbarConfig( editor.config.get( 'balloonToolbar' ) );
this.toolbarView.fillFromConfig( this._balloonConfig, editor.ui.componentFactory );
```

Gotchas: position `target` is a **function** (recomputed for scrolling); selection changes are
debounced (~200 ms); hides on blur/collapsed selection; `decorate('show')` lets you cancel showing.
Contrast with `WidgetToolbarRepository` (toolbar tied to a selected widget, registered in
`afterInit()` with `getRelatedElement`) — see `widgets.md` and `ui-and-localization.md`.

## Raw HTML widgets (createRawElement)

For embedding arbitrary HTML the editor shouldn't parse (html-embed):

```ts
// packages/ckeditor5-html-embed/src/htmlembedediting.ts
editor.data.registerRawContentMatcher( { name: 'div', classes: 'raw-html-embed' } ); // keep inner HTML on upcast

conversion.for( 'dataDowncast' ).elementToElement( {
	model: 'rawHtml',
	view: ( el, { writer } ) => writer.createRawElement( 'div', { class: 'raw-html-embed' },
		domElement => { domElement.innerHTML = el.getAttribute( 'value' ) || ''; } )
} );
```

`createRawElement(tag, attrs, renderFn)` — `renderFn(domElement)` gets the real DOM node for direct
manipulation (innerHTML, listeners). `registerRawContentMatcher` preserves inner HTML through upcast
instead of converting it. Selection can't enter a raw element.

## Clipboard pipeline

Intercept paste/copy/drop via the clipboard pipeline events rather than raw DOM:

```ts
// packages/ckeditor5-clipboard/src/clipboardpipeline.ts
// input chain:  view 'paste'/'drop' → 'clipboardInput' → 'inputTransformation' → 'contentInsertion'
// output chain: view 'copy'/'cut'   → 'clipboardOutput'
this.listenTo( editor.plugins.get( 'ClipboardPipeline' ), 'inputTransformation', ( evt, data ) => {
	// data.content is a view DocumentFragment; transform pasted content here
}, { priority: 'low' } );
```

Add a custom observer by subclassing `DomEventObserver` and `view.addObserver(MyObserver)` (see the
double-click recipe in `recipes.md`). Prefix custom view events with a namespace.

## Markers in practice

```ts
editor.model.change( writer => {
	writer.addMarker( 'myFeature:1', { range, usingOperation: false, affectsData: false } );
} );
editor.conversion.for( 'editingDowncast' ).markerToHighlight( { model: 'myFeature', view: { classes: 'highlight' } } );
editor.conversion.for( 'dataDowncast' ).markerToData( { model: 'myFeature' } );
editor.conversion.for( 'upcast' ).dataToMarker( { view: 'myFeature' } );
```

- `usingOperation: false` = UI/state markers (search hits, fake selection; not undoable);
  `true` = collaborative/undoable. `affectsData: true` only when the marker is saved as data.
- **Fake visual selection** (keep a selection highlight while a balloon form is open): add a
  non-operation marker over the selection range and `markerToHighlight` it (link/`linkui` pattern).
- Marker ranges are live — they auto-update as the document changes.

## Post-fixers (enforce invariants)

```ts
editor.model.document.registerPostFixer( writer => {
	let changed = false;
	// inspect differ / structure, fix it, set changed = true if you wrote anything
	return changed;        // returning true triggers another pass
} );
editor.editing.view.document.registerPostFixer( writer => { /* view-side cleanup */ return false; } );
```

Post-fixers run after each change (model) or downcast (view) and re-run until all return `false`.
Use to guarantee structure (e.g. a required paragraph inside an editable, no two adjacent X).

## Inserting content — option details

```ts
model.insertObject( element, null, null, { findOptimalPosition: 'auto', setSelection: 'on' } );
const range = model.insertContent( fragmentOrNode, selectionOrPosition ); // returns affected range
const optimal = model.schema.findOptimalInsertionRange( selection, 'imageBlock' );
model.modifySelection( selection, { direction: 'forward', unit: 'character' } ); // unicode-aware
```

- `insertObject` options: `findOptimalPosition` (`'auto'`/`'before'`/`'after'`, block objects),
  `setSelection` (`'on'`/`'after'`). `insertContent` returns the inserted range (collapsed = nothing
  inserted). `findOptimalInsertionRange` avoids splitting blocks (respects widget type-around).

## UI niceties

- `CssTransitionDisablerMixin(MyView)` adds `disableCssTransitions()`/`enableCssTransitions()` —
  wrap a form/panel to avoid flicker on first show (`packages/ckeditor5-ui/src/bindings/`).
- Template bindings: `bind.to('prop')` (attr/text), `bind.if('prop','class')` (conditional class),
  `bind.to(evt => …)` (event). `view.extendTemplate({...})` augments an existing view's template.
- `addKeyboardHandlingForGrid({ keystrokeHandler, focusTracker, gridItems, numberOfColumns, uiLanguageDirection })`
  for arrow-key navigation in grid UIs (special characters, emoji).
- `editor.accessibility.addKeystrokeInfos({ keystrokes: [ { label, keystroke } ] })` (and
  `addKeystrokeInfoGroup`/`addKeystrokeInfoCategory`) feed the Alt+0 help dialog — call after
  registering the keystroke.

## Async work: PendingActions & upload adapters

```ts
const pending = editor.plugins.get( 'PendingActions' );           // a ContextPlugin — add to requires()
const action = pending.add( t( 'Saving changes' ) );
action.bind( 'message' ).to( /* … */ );
pending.remove( action );

// Upload: implement the adapter on FileRepository (packages/ckeditor5-upload)
editor.plugins.get( 'FileRepository' ).createUploadAdapter = loader => ( {
	upload: () => loader.file.then( file => /* … */ ( { default: url } ) ),
	abort: () => {}
} );
```

`PendingActions` warns the user before leaving with unsaved async work. The upload adapter's
`upload()` resolves to a `{ default: url, … }` map of URLs; `loader` exposes `file`, `uploaded`,
`uploadTotal`.

## Config defaults

Call `editor.config.define( 'myFeature', { … } )` in the **constructor** (not `init()`), then read
with `editor.config.get( 'myFeature.key' )`. `define()` only fills values the integrator didn't set.

## Editor types (one-liners)

`ClassicEditor` (boxed UI, sticky toolbar), `InlineEditor` (floating toolbar over an inline
editable), `BalloonEditor` (selection balloon toolbar), `DecoupledEditor` (you place toolbar +
editable yourself), `MultiRootEditor` (many editables, no `ElementApiMixin`; `sourceElements` map).
All share the `create()` flow: `initPlugins()` → `ui.init()` → `data.init()` → fire `ready`. See
`tooling-and-packaging.md` for the custom-creator anatomy.
