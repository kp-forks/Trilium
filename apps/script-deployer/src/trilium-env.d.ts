/**
 * Ambient type declarations for the virtual modules available inside
 * Trilium user scripts (`trilium:preact` and `trilium:api`).
 *
 * These modules don't exist on disk — the server rewrites imports at
 * runtime — but providing declarations here gives us editor
 * intellisense and `tsc` checking for scripts in the `scripts/` dir.
 */

declare module "trilium:preact" {
    export {
        Component,
        Fragment,
        createContext,
        createElement,
        createRef,
        h,
        render,
    } from "preact";

    export {
        useCallback,
        useContext,
        useEffect,
        useLayoutEffect,
        useMemo,
        useReducer,
        useRef,
        useState,
    } from "preact/hooks";
}

/**
 * Global `api` object available inside `runOnBackend()` callbacks.
 * The function body is serialised and executed on the server where
 * Trilium injects this global.
 */
// eslint-disable-next-line no-var
declare var api: {
    createNewNote(params: {
        parentNoteId: string;
        title: string;
        content: string;
        type: string;
        mime?: string;
    }): { note: { noteId: string } };
    [key: string]: unknown;
};

declare module "trilium:api" {
    /** Run a function on the backend. The first arg is serialised. */
    export function runOnBackend<T>(fn: (...args: any[]) => T, params?: any[]): Promise<T>;

    /** Show a toast message. */
    export function showMessage(message: string, timeout?: number): void;

    /** Show an error toast. */
    export function showError(message: string, timeout?: number): void;

    /** Navigate to a note by its ID. */
    export function activateNote(noteId: string): Promise<void>;
}
