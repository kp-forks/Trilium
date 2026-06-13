---
name: ckeditor5-plugin-development
description: >-
  Write, extend, and review CKEditor 5 plugins. Use when building or reviewing a
  CKEditor 5 feature/plugin, or when working with the editing engine (model,
  view, schema, conversion/upcast-downcast), commands, the UI library
  (buttons, dropdowns, dialogs, balloons, toolbars), widgets (block/inline,
  toWidget, nested editables), keystrokes, localization (t()), or scaffolding a
  ckeditor5-* package. Covers the architecture, idiomatic patterns, code-style
  conventions, and a review checklist distilled from the official docs.
---

# CKEditor 5 plugin development

CKEditor 5 is **plugin-based**: every feature — even typing and `<p>` support — is a
plugin. Without plugins the editor is an empty API. This skill distills how to write
new plugins and review existing ones idiomatically.

## When to use this skill

Use it whenever the task involves a CKEditor 5 plugin/feature: creating one, extending
one, debugging editing behavior, or reviewing plugin code for correctness and
convention compliance. Trigger concepts include: model/view/schema, conversion
(upcast/downcast), `Command`, `editor.model.change()`, `ButtonView`/`componentFactory`,
widgets (`toWidget`), `ContextualBalloon`/`Dialog`, `editor.keystrokes`, `t()`
localization, or a `ckeditor5-*` npm package.

## The three pillars

1. **Core editor architecture** (`@ckeditor/ckeditor5-core`) — glue classes: `Editor`,
   `Plugin`, `Command`, plus the event/observable system.
2. **Editing engine** (`@ckeditor/ckeditor5-engine`) — the custom MVC data **model**, the
   **view** (virtual DOM), **schema**, and **conversion** between them. The biggest piece.
3. **UI library** (`@ckeditor/ckeditor5-ui`) — MVC views, templates, and components
   (buttons, dropdowns, dialogs, toolbars).

Mental model of the engine: there is **one model document** that is **converted** into two
views — the **editing view** (what the user sees/edits) and the **data view** (input/output
for `getData()`/`setData()`/paste). You almost always change the **model**; converters
render it to the view. Never hand-edit the view to represent model state.

```
data (HTML) ──upcast──▶ MODEL ──editing downcast──▶ editing view ──render──▶ DOM (contentEditable)
                          │
                          └────data downcast──────▶ data view ──▶ getData()/output HTML
```

## Plugin anatomy

A plugin implements `PluginInterface`; the easy way is to extend `Plugin`. A plain function
`function MyPlugin( editor ) {}` also works for trivial cases.

```js
import { Plugin } from 'ckeditor5';

export default class MyPlugin extends Plugin {
	// Dependencies — the editor loads these automatically before this plugin.
	static get requires() {
		return [ SomeDependency ];
	}

	// Stable name for editor.plugins.get( 'MyPlugin' ) and dependency wiring.
	// In TypeScript: return 'MyPlugin' as const;
	static get pluginName() {
		return 'MyPlugin';
	}

	init() {
		const editor = this.editor;   // the editor that loaded this plugin
		// Register schema, converters, commands, UI, keystrokes, listeners…
	}

	afterInit() {
		// Runs after ALL plugins' init(). Use it when you depend on another
		// plugin's runtime state (e.g. registering a widget toolbar).
	}

	// init()/afterInit() may return a Promise. Plugin extends a base that provides
	// destroy() and this.listenTo()/this.stopListening() (auto-cleaned on destroy).
}
```

Key rules (from the official conventions):

- Every feature is a plugin; plugins are **highly granular** and should know **as little
  about other plugins as possible** (communicate via commands, events, and the schema).
- **Split editing from UI.** The standard pattern is three plugins:
  - `Feature` — the **glue** plugin: `static get requires() { return [ FeatureEditing, FeatureUI ]; }`
  - `FeatureEditing` — schema, conversion, commands (works headless / server-side).
  - `FeatureUI` — buttons, dropdowns, balloons registered in `componentFactory`.
  This enables reuse (someone can take your editing layer and write a different UI).
- Register UI in `editor.ui.componentFactory.add( 'name', locale => view )`, then the user
  adds `'name'` to their `toolbar` config.
- Make features self-configuring: pre-configure the schema and provide config defaults via
  `editor.config.define( 'feature', { … } )`, read with `editor.config.get( 'feature.key' )`.

## Minimal end-to-end example (inline text attribute)

A "highlight" feature = a `$text` attribute ↔ `<mark>` element, a command, a button, a
keystroke. This is the canonical shape for inline styling features.

```js
import { Plugin, Command, ButtonView } from 'ckeditor5';

class HighlightCommand extends Command {
	refresh() {
		const { document, schema } = this.editor.model;
		this.value = document.selection.getAttribute( 'highlight' );
		this.isEnabled = schema.checkAttributeInSelection( document.selection, 'highlight' );
	}
	execute() {
		const model = this.editor.model;
		const selection = model.document.selection;
		const newValue = !this.value;
		model.change( writer => {
			if ( !selection.isCollapsed ) {
				for ( const range of model.schema.getValidRanges( selection.getRanges(), 'highlight' ) ) {
					newValue ? writer.setAttribute( 'highlight', true, range )
					         : writer.removeAttribute( 'highlight', range );
				}
			}
			newValue ? writer.setSelectionAttribute( 'highlight', true )
			         : writer.removeSelectionAttribute( 'highlight' );
		} );
	}
}

export default class Highlight extends Plugin {
	init() {
		const editor = this.editor;

		// 1. Schema: allow the attribute on text.
		editor.model.schema.extend( '$text', { allowAttributes: 'highlight' } );

		// 2. Conversion: model attribute 'highlight' <-> view <mark>.
		editor.conversion.attributeToElement( { model: 'highlight', view: 'mark' } );

		// 3. Command.
		editor.commands.add( 'highlight', new HighlightCommand( editor ) );

		// 4. UI button, reactive to command state.
		editor.ui.componentFactory.add( 'highlight', locale => {
			const button = new ButtonView( locale );
			const command = editor.commands.get( 'highlight' );
			button.set( { label: editor.t( 'Highlight' ), withText: true, isToggleable: true, tooltip: true } );
			button.bind( 'isOn', 'isEnabled' ).to( command, 'value', 'isEnabled' );
			button.on( 'execute', () => { editor.execute( 'highlight' ); editor.editing.view.focus(); } );
			return button;
		} );

		// 5. Keystroke.
		editor.keystrokes.set( 'Ctrl+Alt+H', 'highlight' );
	}
}
```

The same five steps (schema → conversion → command → UI → keystroke) recur in almost every
feature. For elements/objects/widgets you `schema.register(...)` and use `elementToElement`
converters instead of `attributeToElement`; see `references/widgets.md`.

## Development workflow

- **Scaffold a distributable package** with the package generator (`npx ckeditor5-package-generator`).
  See `references/tooling-and-packaging.md`. For a quick local feature you can just add a
  plugin class to an existing project.
- **Always reach for the CKEditor 5 Inspector** while developing — it shows the live model,
  view, schema, commands, and selection. `import CKEditorInspector from '@ckeditor/ckeditor5-inspector'; CKEditorInspector.attach( editor );`
- **Change the model, not the DOM.** Wrap all model mutations in `editor.model.change( writer => … )`
  (one block = one undo step). Use `editor.editing.view.change()` only for view-only state
  (e.g. focus class) that the model does not represent.
- **Verify** with `editor.getData()` / `editor.setData()` and by exercising selection edge
  cases (collapsed vs. ranged, inside objects/limits).

## Reference map

Load the focused reference for the task at hand:

| File | Use it for |
|------|-----------|
| `references/architecture.md` | Model, view, schema, positions/ranges/selections, markers, the event/observable system, binding. The conceptual foundation. |
| `references/conversion.md` | Upcast/downcast pipelines, conversion helpers, custom (callback) converters, attribute/element/marker conversion, position mapping. |
| `references/commands.md` | `Command` patterns: `refresh()`/`execute()`, state (`value`/`isEnabled`), `forceDisabled()`, `affectsData`, command events. |
| `references/ui-and-localization.md` | Views & templates, component catalog (buttons, inputs, dropdowns, dialogs/modals, balloons, toolbars), icons, `componentFactory`, focus/keystroke management, and `t()` localization. |
| `references/widgets.md` | Block & inline widgets: `toWidget`/`toWidgetEditable`, nested editables, `insertObject`, widget toolbars, view↔model position mapping, custom properties. |
| `references/conventions.md` | Naming, file/CSS/BEM rules, imports, JSDoc/visibility, `CKEditorError`, TypeScript rules. For writing idiomatic code and reviewing. |
| `references/tooling-and-packaging.md` | Package generator, `ckeditor5-metadata.json`, build output/integration, custom editor creators, dev-repo setup, the Inspector. |
| `references/review-checklist.md` | A structured checklist for reviewing an existing plugin (architecture, schema, conversion, commands, UI, a11y, conventions). |
| `references/recipes.md` | Task-oriented how-tos: insert content, find/iterate nodes, custom observers, place caret, extend other plugins' UI, etc. |

For **testing** a plugin (Vitest setup, test editors, model/view assertions, command/UI test
patterns), use the separate **`ckeditor5-testing`** skill.

## Quick review checklist (summary)

When reviewing a plugin, confirm: editing/UI split with a glue plugin; `static get requires()`
and `pluginName` present; schema registered/extended and the feature self-configures; symmetric
upcast + (data & editing) downcast converters; a `Command` whose `refresh()` sets `isEnabled`
correctly (disabled where the schema disallows it); UI bound to command state and refocusing the
editing view on execute; keyboard accessibility (keystrokes + `accessibility.addKeystrokeInfos`);
all user-facing strings wrapped in `t()`; model changes inside `model.change()`; cleanup of
trackers/handlers in `destroy()`. Full version: `references/review-checklist.md`.

## Provenance & updating

This skill was distilled from the CKEditor 5 repository at baseline commit
**`9ecca53627`** ("Migrated the horizontal line package tests to Vitest", 2026-06-12).

Primary sources distilled:
- `docs/framework/architecture/*.md` (intro, plugins, core-editor-architecture, editing-engine,
  ui-library, ui-components)
- `docs/framework/how-tos.md`, `docs/framework/custom-editor-creator.md`,
  `docs/framework/deep-dive/localization.md`
- `docs/framework/contributing/{code-style,package-metadata,development-environment}.md`
- `docs/framework/development-tools/**` (package-generator, inspector)
- `docs/tutorials/**` (crash-course, abbreviation-plugin-tutorial, widgets, creating-simple-plugin-timestamp)

To update this skill when the docs change, diff the sources since the baseline and fold in
what moved, then bump the commit reference above:

```bash
git diff 9ecca53627..HEAD -- docs/framework docs/tutorials
```
