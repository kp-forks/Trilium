# Test utilities & data helpers (Trilium)

Trilium plugin tests run against a **real editor** and assert with the model/view stringify-parse
helpers. There are no test-editor factories in Trilium.

## Test against a real `ClassicEditor`

Create a real editor over a real DOM element. Pass `licenseKey: 'GPL'` and only the plugins the
test needs. Tear down in `afterEach`: destroy the editor and remove the element.

```ts
import { ClassicEditor, Paragraph } from 'ckeditor5';
import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import MyEditing from '../src/myediting.js';

describe( 'MyEditing', () => {
	let editorElement: HTMLDivElement, editor: ClassicEditor, model;

	beforeEach( async () => {
		editorElement = document.createElement( 'div' );
		document.body.appendChild( editorElement );

		editor = await ClassicEditor.create( editorElement, {
			licenseKey: 'GPL',
			plugins: [ Paragraph, MyEditing ]
		} );
		model = editor.model;
	} );

	afterEach( () => {
		editorElement.remove();
		return editor.destroy();
	} );
} );
```

Notes:
- `editor.model`, `editor.editing.view`, `editor.ui`, `editor.commands`, `editor.plugins` are all
  available — it's a real editor, not a stripped-down test editor.
- Commands can be instantiated directly for focused tests:
  `command = new InsertMermaidCommand( editor )` after the editor is created.
- Teardown matters: always `editor.destroy()` **and** `editorElement.remove()`, or leftover
  editor DOM/body wrappers will leak between tests.

> The upstream ckeditor5 monorepo ships `ModelTestEditor` / `VirtualTestEditor` /
> `ClassicTestEditor` in `@ckeditor/ckeditor5-core/tests/_utils`, but those are monorepo-internal
> and are **not** available in Trilium. Use a real `ClassicEditor` as above.

## Model & view data helpers

Imported from the `ckeditor5` package. They stringify/parse engine structures and are the backbone
of assertions. **Test/debug only — never in `src/`.**

Model:
- `_setModelData( model, string )` — replace the document content + selection from a string.
- `_getModelData( model[, options] )` — serialize current model + selection to a string.

View:
- `_getViewData( view[, options] )` — serialize a view document (e.g. `editor.editing.view`).

```ts
import { _setModelData, _getModelData, _getViewData } from 'ckeditor5';

_setModelData( model, '<paragraph>foo[]bar</paragraph>' );
expect( _getModelData( model ) ).toEqual( '<paragraph>foo[]bar</paragraph>' );
expect( _getViewData( editor.editing.view ) ).toEqual( '<p>foo{}bar</p>' );
```

Existing Trilium tests sometimes alias on import, e.g.
`import { _setModelData as setModelData, _getModelData as getModelData } from 'ckeditor5'`.

### Selection / range string syntax

- `[` … `]` — a position/range **anchored in an element** (also a collapsed `[]` caret).
- `{` … `}` — a position/range **anchored inside a text node**.
- A mixed range can use both ends, e.g. `<p>{Foo]<b>Bar</b></p>` starts in the `Foo` text node
  and ends in `<p>` at offset 1.
- Text attributes serialize as `<$text key="value">text</$text>`; selection attributes appear on
  the collapsed selection.
- Element ranges wrap the node, e.g. `[<mermaid source="..."></mermaid>]` selects the element.

`_getModelData`/`_getViewData` options of note: `withoutSelection: true` to omit selection
markers; `rootName` to target a non-default root.
