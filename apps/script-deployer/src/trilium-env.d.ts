/// <reference types="vite/client" />

/**
 * Ambient type declarations for the virtual modules available inside
 * Trilium user scripts (`trilium:preact` and `trilium:api`).
 *
 * These modules don't exist on disk — the server rewrites imports at
 * runtime — but providing declarations here gives us editor
 * intellisense and `tsc` checking for scripts in the `scripts/` dir.
 *
 * The frontend `api` surface comes from the shared public script-API module in
 * `@triliumnext/commons` — the same definition the in-editor language service
 * uses — so the deployer and the editor agree. It's kept honest against the real
 * implementation by drift guards in `frontend_script_api.ts`. The Preact API is
 * still pulled directly from its real implementation.
 */

type FrontendApi = import("@triliumnext/commons/src/lib/script_api").FrontendApi;
type PreactApi = typeof import("@triliumnext/client/src/services/frontend_script_api_preact").preactAPI;

/**
 * `trilium:api` — destructured members of the frontend script API.
 *
 * At runtime the server rewrites `require("trilium:api")` to `api`,
 * which is the FrontendApi instance. Scripts destructure named
 * members from it: `import { runOnBackend, showMessage } from "trilium:api"`.
 */
declare module "trilium:api" {
    // Re-export every member of the frontend API as a named export.
    export const {
        activateNote,
        showMessage,
        showError,
        runOnBackend,
        getNote,
        getActiveContextNote,
        getActiveContextTextEditor,
        getActiveContextCodeEditor,
        getActiveContextNotePath,
        getComponentByEl,
        bindGlobalShortcut,
        triggerEvent,
        triggerCommand,
        getNoteContexts,
        refreshIncludedNote,
        createLink,
        startNote,
        currentNote,
        originEntity,
        dayjs,
    }: FrontendApi;
}

/**
 * `trilium:preact` — destructured members of the Preact API surface.
 *
 * At runtime the server rewrites `require("trilium:preact")` to
 * `api.preact`, which is the frozen preactAPI object. Scripts
 * destructure from it: `import { useState, h } from "trilium:preact"`.
 */
declare module "trilium:preact" {
    export const {
        // Core
        h,
        Fragment,
        createContext,
        defineWidget,
        defineLauncherWidget,

        // Hooks
        useCallback,
        useContext,
        useEffect,
        useLayoutEffect,
        useMemo,
        useReducer,
        useRef,
        useState,

        // Built-in components
        ActionButton,
        Admonition,
        Button,
        CKEditor,
        Collapsible,
        Dropdown,
        FormCheckbox,
        FormDropdownList,
        FormFileUploadButton,
        FormFileUploadActionButton,
        FormGroup,
        FormListItem,
        FormDropdownDivider,
        FormDropdownSubmenu,
        FormRadioGroup,
        FormText,
        FormTextArea,
        FormTextBox,
        FormToggle,
        Icon,
        LinkButton,
        LoadingSpinner,
        Modal,
        NoteAutocomplete,
        NoteLink,
        RawHtml,
        Slider,
        RightPanelWidget,
    }: PreactApi;
}

/**
 * Global `api` object available inside `runOnBackend()` callbacks.
 * The function body is serialised and executed on the server where
 * Trilium injects this as a global.
 */
// eslint-disable-next-line no-var
declare var api: import("@triliumnext/server/src/services/backend_script_api").Api;
