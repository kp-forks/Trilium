# Reviewing a CKEditor 5 plugin

A structured checklist for reviewing existing plugin code. Pair each item with the relevant
reference file when you need the "why". Flag deviations; not every item applies to every
plugin (e.g. a UI-only or editing-only plugin).

## Architecture & structure

- [ ] **Editing/UI split**: a glue plugin (`static get requires() { return [ XEditing, XUI ]; }`),
      with schema/conversion/commands in `*Editing` and UI in `*UI`. Single-file plugins are ok
      for trivial features but a split is expected for anything reusable.
- [ ] `static get pluginName()` present (TS: `as const`) and `static get requires()` declares
      real dependencies (e.g. `Widget`, `ContextualBalloon`, `WidgetToolbarRepository`).
- [ ] Init logic in `init()`; cross-plugin runtime wiring in `afterInit()`.
- [ ] Plugin knows little about other plugins — collaborates via commands/events/schema, not
      reaching into internals.
- [ ] Self-configuring: schema pre-configured; config defaults via `editor.config.define()`,
      read via `editor.config.get()`. No required manual schema setup pushed onto the user.

## Schema

- [ ] Inline features `schema.extend( '$text', { allowAttributes } )`; elements/objects use
      `schema.register()` with correct `inheritAllFrom` (`$blockObject` / `$inlineObject` /
      `$block`) and `allowIn` / `allowContentOf`.
- [ ] Semantic flags correct: `isLimit` for non-splittable editables, object types for atomic
      elements; `addChildCheck`/`addAttributeCheck` used to disallow invalid nesting/attrs.

## Conversion

- [ ] Symmetric coverage: an **upcast** plus **downcast**; editing vs. data downcast split
      only when needed (widget/UI extras go to `editingDowncast` so `getData()` stays clean).
- [ ] Correct helpers/direction (`elementTo…` upcast, `…ToElement` downcast); `attributeToElement`
      naming reflects model-first thinking.
- [ ] Custom callback converters use the provided `writer`; consumables handled in advanced
      converters; inline widgets register `viewToModelPositionOutsideModelElement` mapping.
- [ ] Everything rendered/round-tripped has a converter (un-converted elements/attributes are
      filtered out).

## Commands

- [ ] Logic lives in a `Command`, not inline in a button handler.
- [ ] `refresh()` sets `isEnabled` from a real schema check (disabled where the attribute/child
      isn't allowed) and `value` reflecting current state; no manual state fighting `refresh()`.
- [ ] `execute()` wraps mutations in `model.change()`; handles collapsed vs. ranged selection;
      uses `getValidRanges`/`insertObject`/`insertContent` rather than unsafe low-level writes.
- [ ] Boolean attributes set `true` / removed (never stored as `false`).
- [ ] External disabling via `forceDisabled()/clearForceDisabled()`; `affectsData=false` only
      for non-data commands that must stay enabled in read-only.

## UI

- [ ] Components registered in `editor.ui.componentFactory.add(name, locale => view)`; `locale`
      passed to constructors.
- [ ] Button/dropdown state **bound** to command (`bind('isOn','isEnabled').to(command,'value','isEnabled')`),
      not manually toggled.
- [ ] Handlers call `editor.editing.view.focus()` after executing.
- [ ] Custom views encapsulate their DOM (no direct `element.*` writes that collide with
      bindings); dropdowns/dialogs/balloons use the provided helpers; balloons clean up via
      `clickOutsideHandler` and remove themselves on hide.

## Accessibility

- [ ] Keyboard support: `editor.keystrokes.set()` for shortcuts; form views use `FocusTracker`
      + `KeystrokeHandler` + `FocusCycler`, and **destroy** them in `destroy()`.
- [ ] Shortcuts registered with `editor.accessibility.addKeystrokeInfos()` and shown in the
      button `keystroke` tooltip; labels set even when `withText` is false.
- [ ] Dialogs/modals always leave a way to close (don't trap Esc without an alternative).

## Localization

- [ ] All user-facing strings go through `t()` (named exactly `t` in JS; literal first arg).
      Reused strings from other packages use the `locale.t` alias, not `t()`.

## Conventions & hygiene

- [ ] Naming/imports/file names/CSS-BEM/JSDoc/TS rules per `conventions.md`; `CKEditorError`
      with `@error`.
- [ ] Listeners use `this.listenTo()` (auto-cleaned); any other resources cleaned in `destroy()`.
- [ ] `ckeditor5-metadata.json` updated for new public plugins/UI/HTML output (for distributable
      packages).
- [ ] Model is the source of truth — no view hacks standing in for model state (except genuine
      view-only state like focus).
