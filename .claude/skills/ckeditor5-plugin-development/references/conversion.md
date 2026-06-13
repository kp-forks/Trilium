# Conversion: upcast & downcast

Conversion connects the **model** and the **view**. For the editor the **model is the source
of truth**; HTML/data is just I/O. That is why helper names look "reversed": converting the
`<mark>` element ↔ `highlight` model attribute uses `attributeToElement` (you name the
**model** side first).

## Pipelines

- **Upcast** (`upcast`) — view → model. Used when loading data **and** when pasting.
- **Downcast** has two flavors:
  - **dataDowncast** — model → output HTML (`getData()`, copy).
  - **editingDowncast** — model → editing view shown in the UI (continuous).

Use the **same** representation for both downcasts when possible; split them when the editing
view needs extras the data must not have (widget handles, UI elements, `contentEditable`,
nested-editable wiring). Editing-only enhancements (`toWidget`, `toWidgetEditable`, UI
elements) belong in `editingDowncast` so `getData()` stays clean.

## Two ways to register converters

**Two-way helpers** on `editor.conversion` — concise, for simple symmetric conversions.
They register both upcast and (data+editing) downcast at once:

```js
editor.conversion.attributeToElement( { model: 'highlight', view: 'mark' } );
editor.conversion.elementToElement( { model: 'simpleBox', view: { name: 'section', classes: 'simple-box' } } );
editor.conversion.attributeToAttribute( { model: 'secret', view: { name: 'section', key: 'class', value: 'secret' } } );
```

**Pipeline-scoped** via `editor.conversion.for( pipeline )` — for asymmetric/custom cases.
The same `attributeToElement` example expanded:

```js
editor.conversion.for( 'upcast' ).elementToAttribute( { model: 'highlight', view: 'mark' } );
editor.conversion.for( 'dataDowncast' ).attributeToElement( { model: 'highlight', view: 'mark' } );
editor.conversion.for( 'editingDowncast' ).attributeToElement( { model: 'highlight', view: 'mark' } );
```

Note the directionality: **upcast** uses `elementTo…` helpers (view→model), **downcast** uses
`…ToElement` helpers (model→view).

## Helper catalog

Upcast helpers (`for('upcast')`): `elementToElement`, `elementToAttribute`,
`attributeToAttribute`, `dataToMarker`.
Downcast helpers (`for('dataDowncast'|'editingDowncast'|'downcast')`): `elementToElement`,
`elementToStructure`, `attributeToElement`, `attributeToAttribute`, `markerToElement`,
`markerToHighlight`, `markerToData`.

## Callback (custom) converters

When the value isn't a fixed string, pass a `view`/`model` **callback**. The 2nd arg is the
conversion API with a `writer` (a `ViewDowncastWriter` downcast / `ModelWriter` upcast),
`consumable`, etc.

Downcast — model attribute value into a view element with an attribute:

```js
conversion.for( 'downcast' ).attributeToElement( {
	model: 'abbreviation',
	view: ( modelAttributeValue, { writer } ) =>
		writer.createAttributeElement( 'abbr', { title: modelAttributeValue } )
} );
```

Upcast — read a view attribute into the model attribute value:

```js
conversion.for( 'upcast' ).elementToAttribute( {
	view: { name: 'abbr', attributes: [ 'title' ] },
	model: { key: 'abbreviation', value: viewElement => viewElement.getAttribute( 'title' ) }
} );
```

Element callbacks build view structure with the view writer (`createContainerElement`,
`createEditableElement`, `createEmptyElement`, `createText`, `createPositionAt`, `insert`,
`setCustomProperty`):

```js
conversion.for( 'editingDowncast' ).elementToElement( {
	model: 'placeholder',
	view: ( modelItem, { writer } ) => {
		const span = writer.createContainerElement( 'span', { class: 'placeholder' } );
		writer.insert( writer.createPositionAt( span, 0 ), writer.createText( `{${ modelItem.getAttribute( 'name' ) }}` ) );
		return toWidget( span, writer ); // editing-only widget wrapping
	}
} );
```

## View matching patterns (upcast)

The `view` matcher accepts a tag string or an object: `{ name, classes, attributes, styles }`.
`attributes` can be an array of names to require or a map of name→value. Be specific so you
don't greedily match unrelated elements.

## Consumables

Each view/model item is "consumed" once during conversion so multiple converters don't
double-process it. In advanced converters you manage this explicitly with `consumable.consume(
item, 'insert' | 'attribute:foo' | … )` and `consumable.test(...)`. Example: a `dataDowncast`
that flattens nested model elements into one view element consumes the children itself
(see `recipes.md` "single view element / multiple model elements").

## Position mapping (inline widgets / structural mismatch)

When the view has "more" content than the model (e.g. a `<placeholder>` model element renders
as `<span>{name}</span>`), some view positions can't auto-map to the model and you get
`model-nodelist-offset-out-of-bounds`. Fix with the ready-made utility:

```js
import { viewToModelPositionOutsideModelElement } from 'ckeditor5';

editor.editing.mapper.on( 'viewToModelPosition',
	viewToModelPositionOutsideModelElement( editor.model, v => v.hasClass( 'placeholder' ) ) );
```

This maps any position inside the view `<span>` to a position **outside** the model element.

## Where to go deeper

The official CKEditor 5 "Conversion deep dive" docs (ckeditor.com/docs → Framework › Deep dive ›
Conversion) cover
`elementToStructure`, reconversion/triggers, marker conversion, and data processors. For
widget-specific conversion patterns see `widgets.md`.
