// Real Preact type declarations injected into the JSX script-note vfs so the
// `trilium:preact` import (and JSX intrinsic elements) resolve to actual types
// rather than `any`.
//
// JSX render notes run Preact's classic `h`/`Fragment` transform at runtime
// (see `buildJsx` in `packages/trilium-core/src/services/script.ts`), but the
// language service only *type-checks* — it never emits. So for checking we use
// the modern automatic runtime (`jsx: ReactJSX`, `jsxImportSource: "preact"`),
// which resolves the full `JSX.IntrinsicElements` namespace from
// `preact/jsx-runtime`. This avoids hand-authoring every HTML element's props.
//
// Like `jquery_types.ts`, the .d.ts text is read with relative `?raw` imports at
// build time, so it tracks the installed `preact` version with no vendored
// snapshot and lands in the lazy script-editor chunk (loaded only when a JSX
// note opens).
import hooksIndex from "../../../../node_modules/preact/hooks/src/index.d.ts?raw";
import jsxRuntime from "../../../../node_modules/preact/jsx-runtime/src/index.d.ts?raw";
import preactDom from "../../../../node_modules/preact/src/dom.d.ts?raw";
import preactIndex from "../../../../node_modules/preact/src/index.d.ts?raw";
import preactJsx from "../../../../node_modules/preact/src/jsx.d.ts?raw";

/**
 * Minimal `package.json` shims so the vfs's node10 module resolution finds each
 * subpath's `types` entry (`exports` maps are ignored under node10). The four
 * `.d.ts` files reference each other via the bare `preact` / `preact/...`
 * specifiers and relative paths, so the directory layout must match the real
 * package.
 */
function typesPackageJson(): string {
    return JSON.stringify({ types: "src/index.d.ts" });
}

/**
 * Virtual files placed under `/node_modules/preact` so `import … from "preact"`,
 * `"preact/hooks"` and `"preact/jsx-runtime"` resolve. Keyed by absolute vfs
 * path. Merge into the JSX env's file map.
 */
export const preactVfsFiles: Record<string, string> = {
    "/node_modules/preact/package.json": typesPackageJson(),
    "/node_modules/preact/src/index.d.ts": preactIndex,
    "/node_modules/preact/src/jsx.d.ts": preactJsx,
    "/node_modules/preact/src/dom.d.ts": preactDom,
    "/node_modules/preact/hooks/package.json": typesPackageJson(),
    "/node_modules/preact/hooks/src/index.d.ts": hooksIndex,
    "/node_modules/preact/jsx-runtime/package.json": typesPackageJson(),
    "/node_modules/preact/jsx-runtime/src/index.d.ts": jsxRuntime
};

/**
 * Ambient declarations for the bare-specifier imports a JSX render note uses.
 *
 *  - `trilium:preact` mirrors the runtime `api.preact` surface: it re-exports
 *    Preact core + all hooks, plus Trilium's `defineWidget`/`defineLauncherWidget`
 *    and the bundled UI components. The heavy components drag in the whole client
 *    widget graph, so (matching `script_api.ts`'s philosophy) they're typed as a
 *    loose `ComponentType<any>` rather than their real prop types.
 *  - `trilium:api` exposes the same object as the `api` global.
 */
export const triliumModulesDts = `
declare module "trilium:preact" {
    import type { ComponentType, VNode } from "preact";
    export * from "preact";
    export * from "preact/hooks";

    export interface WidgetDefinition {
        parent: "right-pane";
        render: () => VNode;
        position?: number;
    }
    export function defineWidget(definition: WidgetDefinition): WidgetDefinition & { type: "preact-widget" };
    export function defineLauncherWidget(definition: { render: () => VNode }): { type: "preact-launcher-widget"; render: () => VNode };

    export const ActionButton: ComponentType<any>;
    export const Admonition: ComponentType<any>;
    export const Button: ComponentType<any>;
    export const CKEditor: ComponentType<any>;
    export const Collapsible: ComponentType<any>;
    export const Dropdown: ComponentType<any>;
    export const FormCheckbox: ComponentType<any>;
    export const FormDropdownList: ComponentType<any>;
    export const FormFileUploadButton: ComponentType<any>;
    export const FormFileUploadActionButton: ComponentType<any>;
    export const FormGroup: ComponentType<any>;
    export const FormListItem: ComponentType<any>;
    export const FormDropdownDivider: ComponentType<any>;
    export const FormDropdownSubmenu: ComponentType<any>;
    export const FormRadioGroup: ComponentType<any>;
    export const FormText: ComponentType<any>;
    export const FormTextArea: ComponentType<any>;
    export const FormTextBox: ComponentType<any>;
    export const FormToggle: ComponentType<any>;
    export const Icon: ComponentType<any>;
    export const LinkButton: ComponentType<any>;
    export const LoadingSpinner: ComponentType<any>;
    export const Modal: ComponentType<any>;
    export const NoteAutocomplete: ComponentType<any>;
    export const NoteLink: ComponentType<any>;
    export const RawHtml: ComponentType<any>;
    export const Slider: ComponentType<any>;
    export const RightPanelWidget: ComponentType<any>;
}

declare module "trilium:api" {
    const api: typeof globalThis.api;
    export default api;
}
`;
