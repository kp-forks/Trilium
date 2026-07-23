/**
 * Model attribute holding a collapsible's expanded state, downcast to the native
 * `open` attribute on `<details>` in both the data and the editing view.
 *
 * A **missing** attribute means collapsed. That keeps every note authored before
 * the state was persisted loading exactly as it did then (fully collapsed), and
 * keeps the saved HTML free of `open="false"` noise — the attribute is only ever
 * present or absent, matching the native boolean-attribute semantics.
 *
 * Lives in its own module so `collapsible-command.ts` can use it without
 * importing `collapsible-editing.ts`, which imports the command back.
 */
export const OPEN_ATTRIBUTE = "open";
