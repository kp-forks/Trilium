# Test utilities & data helpers

The building blocks for editor tests: lightweight test editors, shared `_utils`, and the
model/view stringify-parse helpers.

## Test editors (pick the lightest that works)

All live in `@ckeditor/ckeditor5-core/tests/_utils/` and expose a static async `create()`
returning a Promise. Import with the explicit `.js` extension.

| Editor | Pipelines | Use when |
|--------|-----------|----------|
| `ModelTestEditor` | Full **data** pipeline; **editing pipeline disabled** (no view rendering). Creates the main model root. | Testing pure model logic / commands that only read/write the model. Cheapest. |
| `VirtualTestEditor` | Full **data + engine** pipeline, **no DOM rendering**. Creates the main model root. | Testing engine behavior, conversion, schema, features — without a real editable element. The default for most feature tests. |
| `ClassicTestEditor` | A simplified **full classic editor** with UI mounted into a real element (`ElementApiMixin`, `BoxedEditorUIView`, `InlineEditableUIView`). | Testing UI (toolbar buttons, balloons), DOM interaction, focus, or anything needing `editor.ui`. |

```js
import { ModelTestEditor } from '@ckeditor/ckeditor5-core/tests/_utils/modeltesteditor.js';
import { VirtualTestEditor } from '@ckeditor/ckeditor5-core/tests/_utils/virtualtesteditor.js';
import { ClassicTestEditor } from '@ckeditor/ckeditor5-core/tests/_utils/classictesteditor.js';

// Model only:
editor = await ModelTestEditor.create();                              // then register schema yourself

// Engine + plugins, no DOM:
editor = await VirtualTestEditor.create( { plugins: [ Paragraph, MyFeature ] } );

// Full UI in a real element (remember to create AND remove the element):
editorElement = document.createElement( 'div' );
document.body.appendChild( editorElement );
editor = await ClassicTestEditor.create( editorElement, {
	plugins: [ Paragraph, MyFeatureUI, Heading ],
	toolbar: [ 'myButton' ]
} );
```

Teardown matters: `await editor.destroy()` in `afterEach`, and `editorElement.remove()` if you
appended one. Tests don't pass a `licenseKey` — `test_setup.js` sets the global GPL key.

## Other `_utils` helpers (core)

- `ArticlePluginSet` (`articlepluginset.js`) — a glue plugin bundling a typical article editor
  (Essentials, Paragraph, Heading, Bold/Italic, List, Link, BlockQuote, Image+toolbar/caption,
  Table+toolbar, MediaEmbed, Indent, Autoformat). Drop it into `plugins: [ ArticlePluginSet ]`
  to get a realistic editor without listing everything.
- `removeEditorBodyOrphans()` (`cleanup.js`) — removes leftover `.ck-body-wrapper` elements
  from the DOM; use after tests that intentionally crash editors (orphaned body collections).
- `generateLicenseKey( options )` (`generatelicensekey.js`) — builds license keys for license
  tests (`isExpired`, `expExist`, `licenseType`, `distributionChannel`, …).
- `testUtils` / `testUtils.createSinonSandbox()` (`utils.js`) — **legacy Sinon helper**. In
  Vitest, don't use it; use `vi.spyOn`/`vi.fn` (auto-restored, or `vi.restoreAllMocks()` in
  `afterEach`). See `migration-from-karma.md`.

Packages also keep their own `tests/_utils/` (excluded from the run by config) for
feature-specific fixtures and helpers — follow the local conventions of the package you edit.

## Model & view data helpers

From `@ckeditor/ckeditor5-engine` (the `dev-utils` model/view modules). They stringify/parse
engine structures and are the backbone of assertions. **Test/debug only — never in `src/`.**

Model:
- `_setModelData( model, string )` — replace the document content + selection from a string.
- `_getModelData( model[, options] )` — serialize current model + selection to a string.
- `_stringifyModel( node[, selectionOrRange] )` / `_parseModel( string, schema )` — pure
  serialize/parse without touching a document.

View:
- `_getViewData( view[, options] )` / `_setViewData( view, string )` — same for a view document
  (e.g. `editor.editing.view`).
- `_stringifyView( node )` / `_parseView( string )`.

```js
import { _setModelData, _getModelData, _getViewData } from '@ckeditor/ckeditor5-engine';

_setModelData( model, '<paragraph>foo[]bar</paragraph>' );
expect( _getModelData( model ) ).toEqual( '<paragraph>foo[]bar</paragraph>' );
expect( _getViewData( editor.editing.view ) ).toEqual( '<p>foo{}bar</p>' );
```

### Selection / range string syntax

- `[` … `]` — a position/range **anchored in an element** (also a collapsed `[]` caret).
- `{` … `}` — a position/range **anchored inside a text node**.
- A mixed range can use both ends, e.g. `<p>{Foo]<b>Bar</b></p>` starts in the `Foo` text node
  and ends in `<p>` at offset 1.
- Text attributes serialize as `<$text key="value">text</$text>`; selection attributes appear
  on the collapsed selection.

`_getModelData`/`_getViewData` options of note: `withoutSelection: true` to omit the selection
markers; `rootName` to target a non-default root. Check the `dev-utils/model` and
`dev-utils/view` API for the full option list.
