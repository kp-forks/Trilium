/**
 * Ambient type definitions fed to the TypeScript language service when editing
 * a **frontend** script note (`application/javascript;env=frontend`).
 *
 * This is a hand-curated subset of the real `Api` interface declared in
 * `apps/client/src/services/frontend_script_api.ts`. It is intentionally a
 * standalone `.d.ts` (no imports) so it can be loaded directly into the
 * in-browser virtual TypeScript environment without resolving the client's
 * whole transitive type graph.
 *
 * Follow-up (see PoC notes): replace this curated stub with an auto-generated,
 * fully-faithful declaration produced from the live source at build time.
 */
export default /* ts */ `
interface FAttribute {
    attributeId: string;
    type: "label" | "relation";
    name: string;
    value: string;
    isInheritable: boolean;
}

interface FNote {
    noteId: string;
    title: string;
    type: string;
    mime: string;
    isProtected: boolean;
    getParentNotes(): FNote[];
    getChildNotes(): Promise<FNote[]>;
    getAttributes(type?: string, name?: string): FAttribute[];
    getOwnedAttributes(type?: string, name?: string): FAttribute[];
    getLabelValue(name: string): string | null;
    getLabels(name?: string): FAttribute[];
    hasLabel(name: string): boolean;
    getContent(): Promise<string>;
    getNoteComplement(): Promise<unknown>;
}

interface NoteContext {
    ntxId: string | null;
    note: FNote | null;
    notePath: string | null;
    getCodeEditor(): Promise<unknown>;
    getTextEditor(): Promise<unknown>;
}

/** Trilium frontend script API, exposed to "JS frontend" code notes as the global \`api\`. */
interface FrontendApi {
    /** Note where the script started executing (the event entrypoint). */
    startNote: FNote;
    /** Note where the script is currently executing. */
    currentNote: FNote;
    /** Entity whose event triggered this execution (or null). */
    originEntity: unknown | null;
    /** day.js instance for date manipulation. See https://day.js.org */
    dayjs: (date?: string | number | Date) => { format(template: string): string };

    /** Activates a note in the tree and in the note detail. */
    activateNote(notePath: string): Promise<void>;
    /** Activates a newly created note, ensuring the frontend has fully synced first. */
    activateNewNote(notePath: string): Promise<void>;
    /** Opens a note in a new tab. */
    openTabWithNote(notePath: string, activate: boolean): Promise<void>;
    /** Opens a note in a new split. */
    openSplitWithNote(notePath: string, activate: boolean): Promise<void>;

    /** Executes the given (synchronous) function on the backend. */
    runOnBackend(func: (...args: unknown[]) => unknown, params?: unknown[]): Promise<unknown>;
    /** Executes the given async function on the backend with manual transaction handling. */
    runAsyncOnBackendWithManualTransactionHandling(func: (...args: unknown[]) => unknown, params?: unknown[]): Promise<unknown>;

    /** Powerful attribute/value search, e.g. "#dateModified =* MONTH AND #log". */
    searchForNotes(searchString: string): Promise<FNote[]>;
    /** Returns the first note matching the search, or null. */
    searchForNote(searchString: string): Promise<FNote | null>;
    /** Returns a note by its ID (loading it into the cache if needed). */
    getNote(noteId: string): Promise<FNote | null>;
    /** Returns multiple notes by their IDs. */
    getNotes(noteIds: string[], silentNotFoundError?: boolean): Promise<FNote[]>;

    /** Returns the active note context. */
    getActiveContext(): NoteContext | null;
    /** Returns the note currently active in the detail. */
    getActiveContextNote(): FNote | null;
    /** Returns the CodeMirror editor of the active code note, if any. */
    getActiveContextCodeEditor(): Promise<unknown>;
    /** Returns the text editor of the active text note, if any. */
    getActiveContextTextEditor(): Promise<unknown>;

    /** Calendar helpers. */
    getDayNote(date: string): Promise<FNote | null>;
    getTodayNote(): Promise<FNote | null>;
    getWeekNote(date: string): Promise<FNote | null>;
    getMonthNote(month: string): Promise<FNote | null>;
    getYearNote(year: string): Promise<FNote | null>;

    /** Shows an info-level toast message to the user. */
    showMessage(message: string, delay?: number): void;
    /** Shows an error-level toast message to the user. */
    showError(message: string, delay?: number): void;
    /** Shows a confirm dialog; resolves to true if confirmed. */
    showConfirmDialog(message: string): Promise<boolean>;
    /** Shows a prompt dialog; resolves to the entered string. */
    showPromptDialog(props: { title?: string; message?: string; defaultValue?: string }): Promise<string | null>;

    /** Binds a global keyboard shortcut to a handler. */
    bindGlobalShortcut(keyboardShortcut: string, handler: () => void, namespace?: string): void;
    /** Waits until the frontend is fully synced with the backend. */
    waitUntilSynced(): Promise<void>;
    /** Reloads the given notes from the server into the cache. */
    reloadNotes(noteIds: string[]): Promise<void>;

    /** Writes a line to the script log (visible in the UI). */
    log(message: string): void;
    /** Generates a random alphanumeric string of the given length. */
    randomString(length: number): string;
    /** Formats a note size (in bytes) into a human-readable string. */
    formatSize(size: number): string;
    /** Triggers a Trilium command. */
    triggerCommand(name: string, data?: Record<string, unknown>): void;
}

declare const api: FrontendApi;
`;
