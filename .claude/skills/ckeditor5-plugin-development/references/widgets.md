# Widgets (block & inline)

A **widget** is a model element rendered in the editing view with widget behavior: clickable
to select, copy/paste/delete as a unit, hover/focus outlines, and optional **nested editable**
regions. The widget system lives partly in the engine and partly in `@ckeditor/ckeditor5-widget`.

Two flavors:
- **Block widget** — `inheritAllFrom: '$blockObject'` (e.g. a box, block image, table).
- **Inline widget** — `inheritAllFrom: '$inlineObject'` (text-like; lives where `$text` is
  allowed, e.g. a placeholder/merge-field).

Both follow the standard editing/UI/glue split (see SKILL.md). The editing plugin must
`static get requires() { return [ Widget ]; }` — without the `Widget` plugin the view gets
widget classes but no behavior (clicking won't select).

## Inline widget recipe (placeholder)

Model: `<placeholder name="time">` inside text. View/data: `<span class="placeholder">{time}</span>`.

```js
import { Plugin, Widget, toWidget, viewToModelPositionOutsideModelElement } from 'ckeditor5';

class PlaceholderEditing extends Plugin {
	static get requires() { return [ Widget ]; }
	init() {
		this._defineSchema();
		this._defineConverters();
		this.editor.commands.add( 'placeholder', new PlaceholderCommand( this.editor ) );
		// Map view positions inside the <span> to outside the model element (avoids
		// model-nodelist-offset-out-of-bounds when selecting the widget).
		this.editor.editing.mapper.on( 'viewToModelPosition',
			viewToModelPositionOutsideModelElement( this.editor.model, v => v.hasClass( 'placeholder' ) ) );
		this.editor.config.define( 'placeholderConfig', { types: [ 'date', 'first name', 'surname' ] } );
	}
	_defineSchema() {
		this.editor.model.schema.register( 'placeholder', {
			inheritAllFrom: '$inlineObject',   // selectable, atomic, allowed where $text is; can carry text attrs
			allowAttributes: [ 'name' ]
		} );
	}
	_defineConverters() {
		const conversion = this.editor.conversion;
		conversion.for( 'upcast' ).elementToElement( {
			view: { name: 'span', classes: [ 'placeholder' ] },
			model: ( viewElement, { writer } ) =>
				writer.createElement( 'placeholder', { name: viewElement.getChild( 0 ).data.slice( 1, -1 ) } )
		} );
		conversion.for( 'editingDowncast' ).elementToElement( {
			model: 'placeholder',
			view: ( item, { writer } ) => toWidget( createView( item, writer ), writer )
		} );
		conversion.for( 'dataDowncast' ).elementToElement( {
			model: 'placeholder',
			view: ( item, { writer } ) => createView( item, writer )   // NO toWidget in data
		} );
		function createView( item, writer ) {
			const span = writer.createContainerElement( 'span', { class: 'placeholder' } );
			writer.insert( writer.createPositionAt( span, 0 ), writer.createText( `{${ item.getAttribute( 'name' ) }}` ) );
			return span;
		}
	}
}
```

Command inserts the object and selects it:

```js
class PlaceholderCommand extends Command {
	execute( { value } ) {
		const selection = this.editor.model.document.selection;
		this.editor.model.change( writer => {
			const ph = writer.createElement( 'placeholder', { ...Object.fromEntries( selection.getAttributes() ), name: value } );
			this.editor.model.insertObject( ph, null, null, { setSelection: 'on' } );
		} );
	}
	refresh() {
		const sel = this.editor.model.document.selection;
		this.isEnabled = this.editor.model.schema.checkChild( sel.focus.parent, 'placeholder' );
	}
}
```

UI is typically a `createDropdown` list of types read from config (see `ui-and-localization.md`).

## Block widget recipe (box with nested editables)

Model:

```text
<simpleBox>
  <simpleBoxTitle></simpleBoxTitle>
  <simpleBoxDescription></simpleBoxDescription>
</simpleBox>
```

Schema — the box is a `$blockObject`; children are `isLimit` editables with controlled content:

```js
schema.register( 'simpleBox', { inheritAllFrom: '$blockObject', allowAttributes: [ 'secret' ] } );
schema.register( 'simpleBoxTitle', { isLimit: true, allowIn: 'simpleBox', allowContentOf: '$block' } );
schema.register( 'simpleBoxDescription', { isLimit: true, allowIn: 'simpleBox', allowContentOf: '$root' } );
schema.addChildCheck( ( ctx, child ) => {
	if ( ctx.endsWith( 'simpleBoxDescription' ) && child.name == 'simpleBox' ) return false; // no nesting
} );
```

Conversion — split editing vs. data downcast; `toWidget()` on the container,
`toWidgetEditable()` on each nested editable (built with `createEditableElement`). Upcast and
dataDowncast stay plain so `getData()` is clean:

```js
conversion.for( 'upcast' ).elementToElement( { model: 'simpleBox', view: { name: 'section', classes: 'simple-box' } } );
conversion.for( 'dataDowncast' ).elementToElement( { model: 'simpleBox', view: { name: 'section', classes: 'simple-box' } } );
conversion.for( 'editingDowncast' ).elementToElement( {
	model: 'simpleBox',
	view: ( el, { writer } ) => {
		const section = writer.createContainerElement( 'section', { class: 'simple-box' } );
		writer.setCustomProperty( 'simpleBox', true, section );          // tag for widget detection
		return toWidget( section, writer, { label: 'simple box widget' } );
	}
} );
// title / description:
conversion.for( 'editingDowncast' ).elementToElement( {
	model: 'simpleBoxTitle',
	view: ( el, { writer } ) => toWidgetEditable( writer.createEditableElement( 'h1', { class: 'simple-box-title' } ), writer )
} );
```

`toWidget()` makes content non-editable (sets `contentEditable=false` + classes like
`ck-widget`); `toWidgetEditable()` makes a nested region editable again. They react to hover,
selection, and focus.

Insert command uses `model.insertObject()` (splits paragraphs as needed) and builds the
structure with the writer. **A nested editable needs at least one paragraph** to be editable:

```js
function createSimpleBox( writer ) {
	const box = writer.createElement( 'simpleBox' );
	const title = writer.createElement( 'simpleBoxTitle' );
	const desc = writer.createElement( 'simpleBoxDescription' );
	writer.append( title, box );
	writer.append( desc, box );
	writer.appendElement( 'paragraph', desc );   // required, see ckeditor5#1464
	return box;
}
// refresh(): isEnabled = schema.findAllowedParent( selection.getFirstPosition(), 'simpleBox' ) !== null;
```

## Widget attributes (e.g. a boolean toggle)

Add to schema (`allowAttributes: [ 'secret' ]`), convert with the two-way
`attributeToAttribute` helper (maps a CSS class ↔ model attribute in both pipelines), and
expose a `SwitchButtonView` bound to a toggle command:

```js
conversion.attributeToAttribute( { model: 'secret', view: { name: 'section', key: 'class', value: 'secret' } } );
```

Boolean-attribute convention: set `true` to enable, **remove** the attribute to disable.

## Widget contextual toolbar

Use `WidgetToolbarRepository` (register in `afterInit()`, because it depends on runtime state).
Items come from config; `getRelatedElement` decides when the toolbar shows by finding the
widget view element (detect via the custom property + `isWidget()`):

```js
import { Plugin, WidgetToolbarRepository } from 'ckeditor5';

class SimpleBoxToolbar extends Plugin {
	static get requires() { return [ WidgetToolbarRepository ]; }
	afterInit() {
		const editor = this.editor;
		editor.plugins.get( WidgetToolbarRepository ).register( 'simpleBoxToolbar', {
			items: editor.config.get( 'simpleBox.toolbar' ),     // e.g. [ 'secretSimpleBox' ]
			getRelatedElement: getClosestSimpleBoxWidget
		} );
	}
}
// getRelatedElement walks the view from selection looking for an element where
// !!viewElement.getCustomProperty('simpleBox') && isWidget(viewElement).
```

This is the same mechanism images/tables use to show their contextual toolbars.

## External / async-rendered widgets (math, diagrams, charts)

Widgets that render the output of an external library (KaTeX, Mermaid, a charting lib, a code
highlighter) need a few patterns beyond the static-widget basics. The model stores the **source**
(e.g. a LaTeX string or diagram code) as an attribute; the **data downcast** emits that source as
plain markup (so `getData()` is clean and re-parseable), while the **editing downcast** renders it.

**Host the rendered output in a UI element.** A `UIElement`'s render callback runs in the real
DOM and is the hook for injecting external output into the editing view (UI elements are filtered
out of the data pipeline, so this never pollutes `getData()`):

```js
conversion.for( 'editingDowncast' ).elementToElement( {
	model: { name: 'diagram', attributes: [ 'source' ] },  // attributes → reconvert on change (see below)
	view: ( modelEl, { writer } ) => {
		const wrapper = writer.createContainerElement( 'div', { class: 'diagram' } );
		const rendered = writer.createUIElement( 'div', { class: 'diagram__preview' }, function( domDocument ) {
			const domElement = this.toDomElement( domDocument );      // real DOM node
			void renderInto( domElement, modelEl.getAttribute( 'source' ) );  // async render
			return domElement;
		} );
		writer.insert( writer.createPositionAt( wrapper, 0 ), rendered );
		return toWidget( wrapper, writer, { label: 'diagram' } );
	}
} );
```

**Re-render when the source changes.** Two options:
- **Idiomatic — reconversion.** Listing the attribute in the model matcher
  (`model: { name, attributes: [ 'source' ] }`, as above) makes the converter re-run when `source`
  changes, rebuilding the element and its UI element → the render callback fires again. Simplest;
  rebuilds the whole widget view.
- **Imperative — downcast listener.** To update the existing DOM without rebuilding, listen to the
  editing downcast dispatcher and re-render in place:

  ```js
  editor.editing.downcastDispatcher.on( 'attribute:source:diagram', ( evt, data, conversionApi ) => {
  	const viewEl = conversionApi.mapper.toViewElement( data.item );
  	// locate the rendered DOM node via the view→DOM converter and re-render it
  } );
  ```

**Guard against stale async renders.** Overlapping renders can finish out of order and clobber a
newer one. Gate writes with a generation counter:

```js
this._gen = 0;
async renderInto( domEl, source ) {
	const gen = ++this._gen;
	const out = await lib.render( source );
	if ( gen === this._gen ) domEl.innerHTML = out;   // ignore if a newer render started
}
```

**Lazy-load the library once.** Cache the load promise so a heavy dependency loads on first use
and initializes a single time (drive it from config so the host app can supply the loader):

```js
this._libPromise ??= Promise.resolve( editor.config.get( 'diagram.lazyLoad' )() )
	.then( lib => { lib.initialize( editor.config.get( 'diagram.config' ) ); return lib; } );
const lib = await this._libPromise;
```

**Editable source inside the widget.** If users type the raw source into a textarea/field embedded
in the widget, wrap that element so the editor's own keystroke/selection handlers don't hijack
input — give the container the `data-cke-ignore-events` attribute. Debounce the input handler that
writes back to the model (`editor.model.change(...)`).

**Mode / state machine.** For source/preview/split toggles, store a `displayMode` attribute, expose
commands that set it, render different DOM per mode in the editing downcast, and bind the
widget-toolbar buttons' `isOn` to each command's value so they reflect the current mode.

## Useful widget utilities

`toWidget`, `toWidgetEditable`, `isWidget`, `viewToModelPositionOutsideModelElement`,
`WidgetToolbarRepository`, plus engine helpers `model.insertObject`, `model.insertContent`,
`writer.setCustomProperty`, `selection.getSelectedElement()`, `position.findAncestor(name)`.

If you attach custom DOM event handlers inside a widget, wrap them in a container with the
`data-cke-ignore-events` attribute so the editor's default handlers skip them. Advanced
behaviors are covered by the engine's "widget internals" deep dive. There are also tutorials
for **data from an external source** and **using React in a widget** if your widget needs
async content or framework components.
