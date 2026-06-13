# Code-style conventions

The official CKEditor 5 conventions (enforced by custom ESLint rules). Use them both to write
idiomatic plugins and to review them. Items below note the enforcing ESLint rule where one exists.

## Naming

- Variables/functions/params: `lowerCamelCase`. Classes/mixins: `UpperCamelCase` (mixins end
  in `Mixin`). Global constants: `ALLCAPS`. Private members: `_` prefix (`this._balloon`,
  `_createButton()`).
- Methods are **verbs** (`execute`, `getNextNumber`); properties/variables are **nouns**.
  Booleans use an auxiliary-verb prefix: `isEnabled`, `hasChildren`, `canObserve`, `mustRefresh`.
- **Commands:** action + feature → `insertTable`, `uploadImage`, `addAbbreviation` (not
  `tableInsert`). **Buttons:** verb+noun or noun → `insertTable`, `bold`.
- **Plugins:** feature or feature+sub-feature, `UpperCamelCase` → `Bold`, `ImageResize`,
  `TableClipboard`.
- Acronyms: two-letter stay upper (`getUI`); longer follow camelCase position rules
  (`domError`/`DomError`, `getCKEditorError`). Proper names keep their casing (`CKEditorError`).
- Model/view names follow the feature, lowerCamelCase for elements (`simpleBox`,
  `simpleBoxTitle`, `placeholder`); attributes lowerCamelCase (`linkHref`, `highlight`).

## Files & CSS

- File names: **all lowercase, kebab-case**; a single code entity drops separators
  (`DataProcessor` → `dataprocessor.ts`). Descriptive multi-word test files may use dashes.
- CSS: **BEM**, all lowercase, mandatory `ck-` prefix. Block `ck-dialog`; element
  `ck-dialog__header` (double underscore); modifier `ck-dialog_hidden` /
  `ck-toolbar__group_collapsed` (single underscore); key-value `ck-dropdown-menu_theme_lark`.
  IDs follow the same rules with `ck-` prefix. CSS vars inside `.ck-content` must be
  `--ck-content-*` (`ck-content-variable-name`).

## Imports & modules

- Same package → **relative** paths (`import Position from './position';`). Other packages →
  by **package name / main entry** (`import { Table } from 'ckeditor5';`), never deep relative
  (`../../../ckeditor5-utils/src/...`) (`no-relative-imports`, `no-cross-package-imports`,
  `no-scoped-imports-within-package`).
- All imports include file extensions (`.ts`/`.js`/`.json`) (`require-file-extensions-in-imports`).
- In `@if CK_DEBUG` blocks use `require()`, not `import` (`use-require-for-debug-mode-imports`).
- Each TS source file (in the ckeditor5 source, `packages/*/src/`) starts with a `@module path/file` JSDoc tag matching its
  location (`validate-module-tag`); the package `index.ts` uses `@module <package>`.

## Plugin specifics

- Provide `static get pluginName()` (TS: `return 'Name' as const;`) and `static get requires()`
  for dependencies.
- Plugin boolean flags: set required flags with the exact literal type/value
  (`static override get isFooPlugin(): true { return true; }`); never set them to `false` and
  never set disallowed flags (`ckeditor-plugin-flags`).

## Visibility & documentation

- Public by default. Mark `@protected` / `@private` in JSDoc. Protected members are reachable
  from tests (tests live in the same package) — that's the idiom for testability.
- TS non-public members get `@internal` so they're stripped from `.d.ts`
  (`non-public-members-as-internal`; needs `stripInternal: true`).
- Block comments `/** … */` are for JSDoc only; everything else uses line comments `//`,
  preceded by a blank line, capitalized, ending with a period, one space after `//`.

## Errors

Throw `CKEditorError` with a kebab id and a documenting `@error` JSDoc block explaining cause
and fix (`ckeditor-error-message`):

```js
/**
 * Why this happened and how to fix it.
 *
 * @error ckeditor5-example-error
 */
throw new CKEditorError( 'ckeditor5-example-error', this );
```

## TypeScript rules

- **No `enum`** — use `const X = { … } as const;` + `type X = typeof X[keyof typeof X]`
  (`no-enum`).
- Use `as const` where exact literal types matter (e.g. `pluginName`).
- Don't hardcode `'$root'`: check `node.is( 'rootElement' )` not `name === '$root'`
  (`no-literal-dollar-root`). (Exception: view listener `context: '$root'` for tree bubbling.)
- Pass explicit context to APIs that silently default to `$root`
  (`require-explicit-data-context`): `editor.data.parse( html, '$documentFragment' )`,
  `document.createRoot( '$inlineRoot' )`.

## Formatting

- **Tabs** for indentation (display as 4). LF endings, no trailing spaces. Lines ≤120 chars
  (hard max 140).
- Spaces inside `( … )` and around operators: `if ( a > b ) { c = ( d + e ) * 2; }`. No space
  for empty `()`. Single quotes for strings. Braces on the same line as the head.
- Multi-line calls: first param on a new line, one tab per param, closing paren at the
  statement's indentation.
- Class member order: constructor → getters/setters → iterators → public instance → public
  static → protected instance → protected static → private instance → private static.
- Getters must be fast, side-effect-free, non-throwing, and shouldn't allocate new instances
  each call (cache).
- Avoid >3 positional args (use an options object); extract complex conditions into named
  functions with early returns. Format only the code you actually touch (don't reflow
  unrelated code in a PR).
