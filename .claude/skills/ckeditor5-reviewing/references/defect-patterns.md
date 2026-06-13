# CKEditor 5 defect patterns

The high-value, easy-to-miss failure modes to hunt during a correctness review. Each: **symptom**,
how to **spot** it in a diff, **why** it's wrong, and the **fix**. Grouped by layer. For the
idiomatic "how it should look," see the `ckeditor5-plugin-development` skill.

## Conversion

**Asymmetric / incomplete conversion.**
- Spot: a model element/attribute with an `upcast` but no `dataDowncast` (or vice versa); or only
  `editingDowncast`. Count `for('upcast')` vs `for('dataDowncast')`/`for('editingDowncast')` — but
  remember a **two-way** helper (`conversion.elementToElement`/`attributeToElement`/`attributeToAttribute`)
  registers both directions at once.
- Why: missing `dataDowncast` → content silently dropped on `getData()` (data loss). Missing
  `upcast` → pasted/loaded HTML doesn't become the model. Missing `editingDowncast` → nothing
  renders in the editor.
- Fix: ensure every rendered/round-tripped element & attribute has matching upcast + downcast.

**Editing-only wrapping leaking into data.**
- Spot: `toWidget` / `toWidgetEditable` / UI elements / `contentEditable` / widget classes in a
  `dataDowncast` (or a two-way converter used for a widget).
- Why: `getData()` then emits editor-only markup (`ck-widget`, `contenteditable`) — dirty output.
- Fix: put widget wrapping in `editingDowncast` only; keep `dataDowncast` clean.

**Unconsumed elements in a custom upcast converter → duplication.**
- Spot: a manual `for('upcast').add(dispatcher => …)` that returns early without
  `consumable.consume(...)`, or never consumes the element it handles.
- Why: leftover elements get re-processed by catch-all converters (General HTML Support) →
  duplicated output like `<a><a>…</a></a>`.
- Fix: `test()` before `consume()`, and consume on **every** path that handles the element. (See the
  plugin-dev `conversion.md` consumables section.)

**View element treated as DOM.**
- Spot: `.dataset`, `.classList`, `.getAttributeNS`, `.style.x` on the element inside an
  upcast/downcast callback.
- Why: it's a CKEditor *view* element — those DOM-only APIs return `undefined` and silently drop
  data. Tests that mock the view tree won't catch it.
- Fix: `getAttribute` / `hasAttribute` / `hasClass` / `getClassNames()`; mutate via the view writer.

**Missing reconversion.**
- Spot: an `elementToElement`/`elementToStructure` whose view depends on a model attribute, but the
  attribute isn't listed in the model matcher (`model: { name, attributes: [ 'x' ] }`).
- Why: the view goes stale when the attribute changes (the converter doesn't re-run).
- Fix: declare the attribute to trigger reconversion, or use a separate `attributeToAttribute`/
  `attributeToElement` converter, or `editor.editing.reconvertItem(item)`.

## Schema

**Object/limit flags wrong.**
- Spot: a self-contained element registered without `$blockObject`/`$inlineObject` (or `isObject`);
  a nested editable (title/caption) without `isLimit`.
- Why: without object semantics the element is splittable/partly-selectable/mis-deleted; without
  `isLimit` the caret escapes the editable and Enter/Backspace break it.
- Fix: `inheritAllFrom: '$blockObject' | '$inlineObject'` for atomic elements; `isLimit: true` +
  `allowContentOf` for nested editables.

**Relying on the schema to filter pasted HTML.**
- Spot: assuming a disallowed attribute/element is stripped on paste purely via schema.
- Why: filtering happens at **conversion** — elements/attributes with no registered converter are
  dropped before the schema is consulted. Schema governs structure, not input sanitization.
- Fix: don't register converters for things you don't want; rely on conversion + (if needed) GHS
  config, not schema alone.

**Inline-widget position mapping missing.**
- Spot: an inline object whose view has more content than the model (e.g. `<placeholder>` →
  `<span>{name}</span>`) without a `viewToModelPosition` mapper.
- Why: selecting/traversing it throws `model-nodelist-offset-out-of-bounds`.
- Fix: `editor.editing.mapper.on('viewToModelPosition', viewToModelPositionOutsideModelElement(...))`.

## Commands

**`refresh()` doesn't gate on the schema.**
- Spot: `refresh()` that sets `this.isEnabled = true` unconditionally, or omits a
  `schema.checkAttributeInSelection` / `checkChild` / `findAllowedParent` check.
- Why: the button is enabled where the action is illegal → no-op clicks or schema violations.
- Fix: derive `isEnabled` from a real schema check for the current selection.

**Model mutated outside `model.change()`.**
- Spot: `writer.*` calls or attribute changes not wrapped in `editor.model.change(writer => …)`.
- Why: changes outside a change block don't run conversion/diff → nothing happens (or corruption).
- Fix: wrap all model mutations; one logical operation = one `change()` block = one undo step.

**Boolean attribute stored as `false`.**
- Spot: `writer.setAttribute('secret', false, el)`.
- Why: the idiom is `true` to enable / **remove** to disable (→ `undefined`); `false` leaks into
  data and breaks `value` checks.
- Fix: `setAttribute(key, true)` / `removeAttribute(key)`.

**Collapsed vs. ranged not handled.**
- Spot: an attribute command that only loops `getRanges()` (ignores the collapsed-caret/selection-
  attribute case), or only sets the selection attribute (ignores ranged text).
- Fix: handle both — `getValidRanges()` for ranged, `setSelectionAttribute`/`removeSelectionAttribute`
  for collapsed.

**Read-only correctness.**
- Spot: a command that doesn't change data (opens a dialog, navigates) but gets disabled in
  read-only; or one that *does* change data but stays enabled.
- Fix: set `this.affectsData = false` for non-data commands; leave it `true` (default) otherwise.

**Fighting `refresh()`.**
- Spot: manual `command.isEnabled = false` from outside, undone on the next model change.
- Fix: `command.forceDisabled('MyFeature')` / `clearForceDisabled('MyFeature')`.

## UI

**State set imperatively instead of bound.**
- Spot: `button.isEnabled = …` / `button.isOn = …` updated by hand, or listeners syncing them.
- Why: drifts out of sync with the command.
- Fix: `button.bind('isOn','isEnabled').to(command,'value','isEnabled')`.

**Editor not refocused after an action.**
- Spot: a button/dropdown `execute` handler that runs the command but doesn't
  `editor.editing.view.focus()`.
- Why: focus stays on the button; the user can't keep typing.
- Fix: call `editor.editing.view.focus()` after executing.

**Views created without `locale`; missing a11y.**
- Spot: `new ButtonView()` with no `locale`; no `label` when `withText` is false; keystrokes not in
  `accessibility.addKeystrokeInfos`.
- Fix: pass `locale`; always set `label`; register keystroke info and the button `keystroke`.

## Lifecycle / leaks

**Trackers/handlers/timers not destroyed.**
- Spot: `FocusTracker`, `KeystrokeHandler`, `FocusCycler`, `ResizeObserver`, `setInterval`, or
  manually-added DOM listeners created but no `destroy()` cleaning them; balloon views never removed.
- Why: memory leaks across editor create/destroy cycles (CKEditor even has memory-leak tests).
- Fix: destroy them in the view/plugin `destroy()`; prefer `this.listenTo()` (auto-cleaned).

## Architecture / packaging

**Editing/UI split violated.**
- Spot: schema/converters/commands registered inside the `*UI` plugin; no glue plugin; missing
  `static get requires()` / `pluginName`.
- Why: breaks headless/server-side use and reuse of the editing layer.
- Fix: editing logic in `*Editing`, UI in `*UI`, glue plugin requiring both.

**Outdated / mixed imports (post-v42).**
- Spot: deep imports `@ckeditor/ckeditor5-*/src/...`; mixing the `ckeditor5` aggregate with
  individual `@ckeditor/*` packages in an app bundle; removed/renamed symbols (`Model`/`ViewModel`
  → `UIModel`; `icons.check` → `IconCheck` from `@ckeditor/ckeditor5-icons`).
- Why: deep paths aren't a supported entry; mixing risks duplicate module instances; renamed
  symbols don't exist.
- Fix: import from `ckeditor5` (and `ckeditor5-premium-features`); use current symbol names.

## Localization

**`t()` gaps / misuse.**
- Spot: user-facing strings not wrapped in `t()`; `t` renamed or called on a variable (JS static
  analyzer only recognizes a literal-arg `t()`); a reused string creating a new source message
  instead of aliasing `editor.locale.t`.
- Fix: wrap all UI strings in `t()` with a literal first arg; reuse via the `locale.t` alias.

## Undo / batching

**Unintended multiple undo steps.**
- Spot: several sibling `model.change()` blocks for what is one logical edit.
- Why: each block is a separate undo step — jarring UX.
- Fix: one `change()` per logical operation (nested `change()` folds into the outer batch).

## Tests (cross-check with the testing skill)

- Spot: a behavior change with no new/changed test; assertions via DOM instead of
  `_getModelData`/`_getViewData`; only one selection shape covered; editor not destroyed in
  `afterEach`; legacy Chai/Sinon left in a touched file.
- Fix: test the change itself; assert on stringified model/view; cover collapsed + ranged +
  schema-disallowed; tear down.
