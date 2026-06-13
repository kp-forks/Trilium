# Recipes (task-oriented how-tos)

Common snippets from the official how-tos. All model mutations run inside
`editor.model.change( writer => … )`.

## Get the editor instance

```js
// In a function plugin:
function MyPlugin( editor ) { /* editor.* */ }

// From a DOM editable element:
const editor = document.querySelector( '.ck-editor__editable_inline' ).ckeditorInstance;
```

`CKEDITOR_VERSION` in the console reports the version. There is no global registry of
instances by default.

## Insert content

```js
// Text with an attribute (e.g. a link) at the selection:
editor.model.change( writer => {
	const pos = editor.model.document.selection.getFirstPosition();
	editor.model.insertContent( writer.createText( 'CKEditor 5 rocks!', { linkHref: 'https://ckeditor.com/' } ), pos );
} );

// Plain text:
editor.model.insertContent( writer.createText( 'Plain text' ), pos );

// A chunk of HTML → model fragment → insert:
const viewFragment = editor.data.processor.toView( '<p>A <a href="...">link</a>.</p>' );
const modelFragment = editor.data.toModel( viewFragment );
editor.model.insertContent( modelFragment );
```

`insertContent()` respects the schema; unconverted elements/attributes are dropped.

## Focus the editor / editing view

```js
editor.focus();
editor.editing.view.focus();
```

## Place the caret at start / end

```js
editor.model.change( writer => {
	writer.setSelection( writer.createPositionAt( editor.model.document.getRoot(), 0 ) );      // start
	writer.setSelection( writer.createPositionAt( editor.model.document.getRoot(), 'end' ) );   // end
} );
```

## Delete selected blocks

```js
const blocks = Array.from( editor.model.document.selection.getSelectedBlocks() );
editor.model.change( writer => {
	const range = writer.createRange(
		writer.createPositionAt( blocks[ 0 ], 0 ),
		writer.createPositionAt( blocks[ blocks.length - 1 ], 'end' )
	);
	editor.model.deleteContent( writer.createSelection( range ) );
} );
```

## Find / iterate specific elements

```js
// Remove all block images:
editor.model.change( writer => {
	const range = writer.createRangeIn( editor.model.document.getRoot() );
	const toRemove = [];
	for ( const { item } of range.getWalker() ) {
		if ( item.is( 'element', 'imageBlock' ) ) toRemove.push( item );
	}
	toRemove.forEach( item => writer.remove( item ) );
} );

// Collect unique link targets:
const links = new Set();
for ( const { type, item } of editor.model.createRangeIn( editor.model.document.getRoot() ).getWalker() ) {
	if ( type === 'text' && item.hasAttribute( 'linkHref' ) ) links.add( item.getAttribute( 'linkHref' ) );
}
```

`item.is(...)` is the canonical type check: `is('element', 'name')`, `is('$text')`,
`is('rootElement')`, `is('element')`, etc.

## Set an attribute on the editable DOM root

```js
editor.editing.view.change( writer => {
	writer.setAttribute( 'myAttribute', 'value', editor.editing.view.document.getRoot() );
} );
```

## Custom DOM-event observer (e.g. double-click)

```js
import { DomEventObserver } from 'ckeditor5';

class DoubleClickObserver extends DomEventObserver {
	constructor( view ) { super( view ); this.domEventType = 'dblclick'; }
	onDomEvent( domEvent ) { this.fire( domEvent.type, domEvent ); }
}

const view = editor.editing.view;
view.addObserver( DoubleClickObserver );
editor.listenTo( view.document, 'dblclick', ( evt, data ) => { /* … */ }, { context: 'a' } );
```

Check for an existing observer that already fires the DOM event before adding your own.

## Extend another plugin's UI (e.g. add a button to the link form)

```js
import { ButtonView, Plugin, LinkUI } from 'ckeditor5';

class InternalLink extends Plugin {
	init() {
		const linkUI = this.editor.plugins.get( LinkUI );
		const balloon = this.editor.plugins.get( 'ContextualBalloon' );
		this.listenTo( balloon, 'change:visibleView', ( evt, name, visibleView ) => {
			if ( visibleView === linkUI.formView ) {
				const button = new ButtonView( this.locale );
				button.set( { label: 'Internal link', withText: true, tooltip: true } );
				button.bind( 'isEnabled' ).to( this.editor.commands.get( 'link' ) );
				button.render();
				linkUI.formView.registerChild( button );
				linkUI.formView.element.insertBefore( button.element, linkUI.formView.saveButtonView.element );
			}
		} );
	}
}
```

## Widget: one view element ↔ multiple/nested model elements

Pattern from the how-tos for a form `<input>` ↔ `<forms><formName>…</formName></forms>`:
upcast builds a model sub-structure from a single view element; `editingDowncast` converts
each model element separately (outer → `toWidget`, inner → `toWidgetEditable`); `dataDowncast`
collapses the structure back into one view element, consuming the inner items so other
converters skip them. See the full snippet in `docs/framework/how-tos.md` and `widgets.md`.

## Framework-integration gotcha

Building large React apps may hit `JavaScript heap out of memory`; raise Node's heap:
`NODE_OPTIONS="--max-old-space-size=4096" npm run build`.
