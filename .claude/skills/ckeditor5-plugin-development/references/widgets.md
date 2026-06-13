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

## Useful widget utilities

`toWidget`, `toWidgetEditable`, `isWidget`, `viewToModelPositionOutsideModelElement`,
`WidgetToolbarRepository`, plus engine helpers `model.insertObject`, `model.insertContent`,
`writer.setCustomProperty`, `selection.getSelectedElement()`, `position.findAncestor(name)`.

If you attach custom DOM event handlers inside a widget, wrap them in a container with the
`data-cke-ignore-events` attribute so the editor's default handlers skip them. Advanced
behaviors are covered by the engine's "widget internals" deep dive. There are also tutorials
for **data from an external source** and **using React in a widget** if your widget needs
async content or framework components.
