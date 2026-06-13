# Tooling & packaging

How to scaffold, build, integrate, and debug a distributable CKEditor 5 plugin package.

## Package generator

Scaffold a publishable `ckeditor5-*` package:

```bash
npx ckeditor5-package-generator
```

Package name: `ckeditor5-<name>` or `@<scope>/ckeditor5-<name>` (chars `0-9 a-z - . _`).
Options: `--lang js|ts`, `--plugin-name <Name>`, `--global-name <CKName>` (UMD global),
`--package-manager npm|yarn|pnpm`, `--verbose`.

Generated layout:

```
src/                  plugin code & public exports (index, *editing, *ui, command…)
sample/               local Vite sample app (npm run start)
tests/                Vitest unit tests
theme/                icons & CSS
lang/                 translation context + *.po files
scripts/              helper scripts (translation sync)
ckeditor5-metadata.json
vite.config.[js|ts]
# TS only: src/augmentation.ts, tsconfig.json, tsconfig.build.json, typings/
```

npm scripts: `start` (Vite sample + live reload), `test`, `test:debug`, `lint`, `build`
(npm + browser outputs to `dist/`), `translations:synchronize`, `translations:validate`.

## TypeScript augmentation (`src/augmentation.ts`)

Register your plugin/config/commands into CKEditor's type maps so consumers get typing:

```ts
import type { MyPlugin } from './index.js';
declare module '@ckeditor/ckeditor5-core' {
	interface PluginsMap { [ MyPlugin.pluginName ]: MyPlugin; }
	// also augment EditorConfig (for config) and CommandsMap (for typed commands)
}
```

## Build output & integration

`npm run build` emits:

```
dist/index.js            npm ESM entry (ckeditor5 is external)
dist/index.css           CSS for npm consumers
dist/*.d.ts              type declarations
dist/browser/index.es.js browser ESM (needs ckeditor5 provided via import map)
dist/browser/index.umd.js browser UMD (exposes the --global-name; needs CKEDITOR global)
dist/browser/index.css   CSS for ZIP/CDN
```

Consume via npm:

```js
import { ClassicEditor, Essentials, Paragraph } from 'ckeditor5';
import { MyPlugin } from '<package>';
import 'ckeditor5/ckeditor5.css';
import '<package>/index.css';
ClassicEditor.create( { /* plugins: [ Essentials, Paragraph, MyPlugin ] */ } );
```

For browser (no bundler): use import maps with `dist/browser/index.es.js`, or UMD `<script>`
tags where the editor is on `CKEDITOR` and your plugin on its global name. CDN integration
follows the same browser patterns. (Note: CDN/commercial builds aren't GPL — they need a
commercial license key; the `'GPL'` key only works for self-hosted/source usage.)

## Package metadata (`ckeditor5-metadata.json`)

Lives at the package root; lets external tooling (CKEditor Builder, the plugins/HTML-output
pages) discover plugins, UI components, and HTML output. Document **major** plugins only (not
the internal editing/UI split classes).

```json
{
  "plugins": [ {
    "name": "Display Name",
    "className": "MyPlugin",
    "description": "Short description.",
    "docs": "path/to/docs.html",
    "path": "src/index.js",
    "requires": [ "OtherPlugin", [ "Plugin1", "Plugin2" ] ],
    "registeredToolbars": [ "myFeature.toolbar" ],
    "uiComponents": [
      { "name": "myButton", "type": "Button", "iconName": "IconBold", "toolbars": [ "toolbar" ] }
    ],
    "htmlOutput": [
      { "elements": "span", "classes": "my-class", "styles": "color", "attributes": "data-*", "implements": "$inlineObject", "isAlternative": false }
    ]
  } ]
}
```

Field notes: `requires` nested arrays mean "at least one of"; `uiComponents[].type` is
`Button` | `SplitButton` | `Dropdown`; `iconName` is an export from `@ckeditor/ckeditor5-icons`;
`htmlOutput.implements` lists an inherited pseudo-element; `isAlternative: true` marks config-
dependent (non-default) output.

## CKEditor 5 Inspector

Indispensable debugging tool — shows the live **model**, **view**, **schema**, **commands**,
and selection.

```bash
npm install --save-dev @ckeditor/ckeditor5-inspector
```

```js
import CKEditorInspector from '@ckeditor/ckeditor5-inspector';
ClassicEditor.create( /* … */ ).then( editor => {
	CKEditorInspector.attach( editor );
	// or named: CKEditorInspector.attach( { 'header-editor': editor } );
} );
```

There's also a bookmarklet that injects the inspector without code changes (won't work under a
strict CSP).

## Custom editor creator (advanced)

To build a non-standard editor, implement three classes:

- **Editor** — extends `Editor`. Protected constructor sets up roots/model; static async
  `create(config)` chains `initPlugins()` → `ui.init()` → `data.init()` → fire `ready` and
  resolve with the instance; `destroy()` caches data, destroys UI, restores DOM.
- **EditorUI** — extends `EditorUI`. `init()` renders the view, wires focus tracking, attaches
  editables to the editing view (`attachDomRoot()`), inits placeholder + toolbar
  (`_initToolbar()` → `addToolbar()`); `destroy()` calls `detachDomRoot()`.
- **EditorUIView** — extends `EditorUIView`. Builds the `ToolbarView` and one
  `InlineEditableUIView` per editable; `render()` registers children.

Helpers: `getDataFromElement()`, `setDataInElement()`, `enableViewPlaceholder()`. Most plugin
work never needs this — only when you need a fundamentally different editor shell (e.g. a
multiroot editor).

## Contributing to the ckeditor5 monorepo

Requires Node ≥ 24.11.0, pnpm ≥ 10.17.0, Git.

```bash
git clone https://github.com/ckeditor/ckeditor5.git && cd ckeditor5
pnpm install
pnpm run test -- -wcs --files=engine   # watch + coverage + source-map, one package
pnpm run manual                         # manual test server
pnpm run docs && pnpm run docs:serve    # build & serve docs
npm run clean-up-svg-icons path/to/*.svg  # optimize icons (SVGO)
```
