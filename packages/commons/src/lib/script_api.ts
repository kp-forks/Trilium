/**
 * Public type surface for Trilium **user scripts** — the shape of the `api`
 * global available inside frontend/backend script notes.
 *
 * This is the single source of truth for script API types, consumed by:
 *  - the in-editor TypeScript language service (bundled into the script-note vfs),
 *  - the `script-deployer` app (script authoring/typechecking),
 * and kept honest against the real implementations by member-presence drift
 * guards (see `frontend_script_api.ts` / `backend_script_api.ts`).
 *
 * It is intentionally **self-contained** (no imports): the real `Api` interfaces
 * drag in the whole client/server graph (froca, widgets, jQuery, Vite `?raw`
 * imports) which can't be resolved by a browser-based language service. These
 * are faithful, decoupled re-declarations of the public surface — heavy or
 * advanced members (widget base classes, editor instances, the Preact API) are
 * typed as `unknown` rather than pulling in their real types.
 */

/** A label or relation attached to a note. */
export interface ScriptAttribute {
    attributeId: string;
    type: "label" | "relation";
    name: string;
    value: string;
    isInheritable: boolean;
    isOwned: boolean;
}

/** A note as seen by frontend scripts (subset of the client's `FNote`). */
export interface ScriptFNote {
    noteId: string;
    title: string;
    type: string;
    mime: string;
    isProtected: boolean;
    attributes: string[];
    parents: string[];
    children: string[];

    getParentNotes(): ScriptFNote[];
    getChildNotes(): Promise<ScriptFNote[]>;
    getParentNoteIds(): string[];
    getChildNoteIds(): string[];

    getAttributes(type?: string, name?: string): ScriptAttribute[];
    getOwnedAttributes(type?: string, name?: string): ScriptAttribute[];
    getAttribute(type: string, name: string): ScriptAttribute | null;
    hasAttribute(type: string, name: string): boolean;
    getLabels(name?: string): ScriptAttribute[];
    getLabelValue(name: string): string | null;
    hasLabel(name: string): boolean;
    getRelations(name?: string): ScriptAttribute[];
    getRelationValue(name: string): string | null;
    getRelationTarget(name: string): Promise<ScriptFNote | null>;

    getContent(): Promise<string | Uint8Array>;
    getIcon(): string;
    isRoot(): boolean;
}

/** A split/tab context as seen by frontend scripts (subset of `NoteContext`). */
export interface ScriptNoteContext {
    ntxId: string | null;
    note: ScriptFNote | null;
    notePath: string | null;
    getCodeEditor(): Promise<unknown>;
    getTextEditor(): Promise<unknown>;
}

/** Minimal day.js surface (the real API exposes the full day.js factory). */
export type ScriptDayjs = (date?: string | number | Date) => {
    format(template?: string): string;
    add(value: number, unit: string): ReturnType<ScriptDayjs>;
    subtract(value: number, unit: string): ReturnType<ScriptDayjs>;
    toDate(): Date;
};

type Func = ((...args: unknown[]) => unknown) | string;

/**
 * The `api` global available inside **frontend** script notes
 * (`application/javascript;env=frontend`).
 */
export interface FrontendApi {
    /** Container of all the rendered script content (jQuery element). */
    $container: unknown;
    /** Note where the script started executing (the event entrypoint). */
    startNote: ScriptFNote;
    /** Note where the script is currently executing. */
    currentNote: ScriptFNote;
    /** Entity whose event triggered this execution (a note, or null). */
    originEntity: unknown | null;
    /** day.js library for date manipulation. See https://day.js.org */
    dayjs: ScriptDayjs;

    /** Base class for right-panel widgets. */
    RightPanelWidget: unknown;
    /** Base class for note-context-aware widgets. */
    NoteContextAwareWidget: unknown;
    /** Base class for basic widgets. */
    BasicWidget: unknown;

    /** Activates a note in the tree and in the note detail. */
    activateNote(notePath: string): Promise<void>;
    /** Activates a newly created note, ensuring the frontend has fully synced first. */
    activateNewNote(notePath: string): Promise<void>;
    /** Opens a note in a new tab. */
    openTabWithNote(notePath: string, activate: boolean): Promise<void>;
    /** Opens a note in a new split. */
    openSplitWithNote(notePath: string, activate: boolean): Promise<void>;

    /** Executes the given (synchronous) function on the backend. */
    runOnBackend(func: Func, params?: unknown[]): Promise<unknown>;
    /** Executes the given async function on the backend with manual transaction handling. */
    runAsyncOnBackendWithManualTransactionHandling(func: Func, params?: unknown[]): Promise<unknown>;

    /** Powerful attribute/value search, e.g. "#dateModified =* MONTH AND #log". */
    searchForNotes(searchString: string): Promise<ScriptFNote[]>;
    /** Returns the first note matching the search, or null. */
    searchForNote(searchString: string): Promise<ScriptFNote | null>;
    /** Returns a note by its ID (loading it into the cache if needed), or null. */
    getNote(noteId: string): Promise<ScriptFNote | null>;
    /** Returns multiple notes by their IDs (bulk-fills the cache). */
    getNotes(noteIds: string[], silentNotFoundError?: boolean): Promise<ScriptFNote[]>;
    /** Refreshes the given notes in the frontend cache from the backend. */
    reloadNotes(noteIds: string[]): Promise<void>;
    /** The name identifying this particular Trilium instance, or null. */
    getInstanceName(): string | null;

    /** Adds plain text at the active editor's cursor. */
    addTextToActiveContextEditor(text: string): void;
    /** The active note loaded into the center pane. */
    getActiveContextNote(): ScriptFNote;
    /** The currently active/focused split in the current tab. */
    getActiveContext(): ScriptNoteContext;
    /** The main (left-most) context of the current tab. */
    getActiveMainContext(): ScriptNoteContext;
    /** All note contexts (splits) across all tabs. */
    getNoteContexts(): ScriptNoteContext[];
    /** All main contexts (one per tab). */
    getMainNoteContexts(): ScriptNoteContext[];
    /** The CKEditor instance of the active text note, if any. */
    getActiveContextTextEditor(): Promise<unknown>;
    /** The CodeMirror instance of the active code note, if any. */
    getActiveContextCodeEditor(): Promise<unknown>;
    /** The widget handling the active note detail. */
    getActiveNoteDetailWidget(): Promise<unknown>;
    /** The note path of the active note, or null. */
    getActiveContextNotePath(): string | null;
    /** The component owning the given DOM element (nearest parent in the DOM tree). */
    getComponentByEl(el: HTMLElement): unknown;

    /** Shows an info toast message to the user. */
    showMessage(message: string, delay?: number): void;
    /** Shows an error toast message to the user. */
    showError(message: string, delay?: number): void;
    /** Shows an info dialog to the user. */
    showInfoDialog(message: string): Promise<void>;
    /** Shows a confirm dialog; resolves true if the user confirmed. */
    showConfirmDialog(message: string): Promise<boolean>;
    /** Shows a prompt dialog; resolves to the user's answer. */
    showPromptDialog(props: { title?: string; message?: string; defaultValue?: string }): Promise<string | null>;

    /** Creates a note link (jQuery element) for the given note path. */
    createLink(notePath: string, params?: Record<string, unknown>): unknown;
    /** @deprecated use createLink() instead */
    createNoteLink(notePath: string, params?: Record<string, unknown>): unknown;

    /** Triggers a Trilium command (low-level). */
    triggerCommand(name: string, data?: Record<string, unknown>): Promise<unknown>;
    /** Triggers a Trilium event (low-level). */
    triggerEvent(name: string, data?: Record<string, unknown>): Promise<unknown>;
    /** Sets up a tooltip on the given jQuery element. */
    setupElementTooltip(el: unknown): void;
    /** Protects/unprotects a note. */
    protectNote(noteId: string, protect: boolean): Promise<void>;
    /** Protects/unprotects a whole subtree. */
    protectSubTree(noteId: string, protect: boolean): Promise<void>;

    /** Returns (creating if needed) the date-note for today. */
    getTodayNote(): Promise<ScriptFNote>;
    /** Returns (creating if needed) the day-note for the given "YYYY-MM-DD" date. */
    getDayNote(date: string): Promise<ScriptFNote>;
    /** Returns (creating if needed) the week's first day-note for the given date. */
    getWeekFirstDayNote(date: string): Promise<ScriptFNote>;
    /** Returns (creating if needed) the week-note for the given "YYYY-MM-DD" date. */
    getWeekNote(date: string): Promise<ScriptFNote>;
    /** Returns (creating if needed) the month-note for the given "YYYY-MM" month. */
    getMonthNote(month: string): Promise<ScriptFNote>;
    /** Returns (creating if needed) the quarter-note for the given date. */
    getQuarterNote(date: string): Promise<ScriptFNote>;
    /** Returns (creating if needed) the year-note for the given "YYYY" year. */
    getYearNote(year: string): Promise<ScriptFNote>;

    /** Hoists a note in the current tab ('root' effectively unhoists). */
    setHoistedNoteId(noteId: string): void;
    /** Binds a global keyboard shortcut (e.g. "ctrl+shift+a") to a handler. */
    bindGlobalShortcut(keyboardShortcut: string, handler: () => void, namespace?: string): void;
    /** Resolves once all backend → frontend synchronization is finished. */
    waitUntilSynced(): Promise<unknown>;
    /** Refreshes all open notes that include the given note. */
    refreshIncludedNote(includedNoteId: string): void;

    /** Returns a random (non-cryptographic) alphanumeric string of the given length. */
    randomString(length: number): string;
    /** Formats a size in bytes into a human-readable string. */
    formatSize(size: number): string;
    /** @deprecated use formatSize() */
    formatNoteSize(size: number): string;
    /** Formats a date as "YYYY-MM-DD". */
    formatDateISO(date: Date): string;
    /** Parses a date string into a Date. */
    parseDate(str: string): Date;

    /** Per-note log message buffers shown in the UI log pane. */
    logMessages: Record<string, string[]>;
    /** Per-note spaced-update handlers for the log pane. */
    logSpacedUpdates: Record<string, unknown>;
    /** Logs a message to the UI log pane (joins arguments like console.log). */
    log(...args: unknown[]): void;

    /** The Preact API surface (components, hooks) for render scripts. */
    preact: unknown;
}

/** A branch (note→parent placement) as seen by backend scripts (subset of `BBranch`). */
export interface ScriptBBranch {
    branchId: string;
    noteId: string;
    parentNoteId: string;
    prefix: string | null;
    notePosition: number;
    isExpanded: boolean;
    getNote(): ScriptBNote;
    getParentNote(): ScriptBNote | null;
}

/** A note as seen by backend scripts (subset of trilium-core's `BNote`). */
export interface ScriptBNote {
    noteId: string;
    title: string;
    type: string;
    mime: string;
    isProtected: boolean;

    getContent(): string | Uint8Array;
    setContent(content: string | Uint8Array, opts?: { forceFrontendReload?: boolean }): void;
    getJsonContent<T = unknown>(): T | null;
    /** Plain serialisable representation of the note (the real return type is `NotePojo`). */
    getPojo(): Record<string, unknown>;

    getParentNotes(): ScriptBNote[];
    getChildNotes(): ScriptBNote[];
    getParentBranches(): ScriptBBranch[];
    getChildBranches(): ScriptBBranch[];

    getAttributes(type?: string, name?: string): ScriptAttribute[];
    getOwnedAttributes(type?: string, name?: string): ScriptAttribute[];
    getAttribute(type: string, name: string): ScriptAttribute | null;
    hasAttribute(type: string, name: string): boolean;
    getLabel(name: string): ScriptAttribute | null;
    getLabels(name?: string): ScriptAttribute[];
    getLabelValue(name: string): string | null;
    hasLabel(name: string): boolean;
    addLabel(name: string, value?: string, isInheritable?: boolean): ScriptAttribute;
    getRelation(name: string): ScriptAttribute | null;
    getRelations(name?: string): ScriptAttribute[];
    getRelationValue(name: string): string | null;
    getRelationTarget(name: string): ScriptBNote | null;
    addRelation(name: string, targetNoteId: string, isInheritable?: boolean): ScriptAttribute;
    addAttribute(type: string, name: string, value?: string, isInheritable?: boolean): ScriptAttribute;
    isFolder(): boolean;
}

/** Result of the backend note-creation helpers. */
export interface ScriptNoteAndBranch {
    note: ScriptBNote;
    branch: ScriptBBranch;
}

/**
 * The `api` global available inside **backend** script notes
 * (`application/javascript;env=backend`). Runs server-side: no DOM, no jQuery.
 */
export interface BackendApi {
    /** Note where the script started executing (the entrypoint). */
    startNote?: ScriptBNote | null;
    /** Note where the script is currently executing. */
    currentNote: ScriptBNote;
    /** Entity whose event triggered this execution. */
    originEntity?: unknown | null;

    /** day.js library for date manipulation. */
    dayjs: ScriptDayjs;
    /** xml2js library for XML parsing. */
    xml2js: unknown;
    /** @deprecated use htmlParser instead */
    cheerio: unknown;
    /** node-html-parser for HTML parsing. */
    htmlParser: unknown;

    /** The name identifying this particular Trilium instance, or null. */
    getInstanceName(): string | null;

    /** Returns a note by its ID, or null. */
    getNote(noteId: string): ScriptBNote | null;
    /** Returns a branch by its ID, or null. */
    getBranch(branchId: string): ScriptBBranch | null;
    /** Returns an attribute by its ID, or null. */
    getAttribute(attributeId: string): ScriptAttribute | null;
    /** Returns an attachment by its ID, or null. */
    getAttachment(attachmentId: string): unknown | null;
    /** Returns a revision by its ID, or null. */
    getRevision(revisionId: string): unknown | null;
    /** Returns an ETAPI token by its ID, or null. */
    getEtapiToken(etapiTokenId: string): unknown | null;
    /** Returns all ETAPI tokens. */
    getEtapiTokens(): unknown[];
    /** Returns an option by name, or null. */
    getOption(optionName: string): unknown | null;
    /** Returns all options. */
    getOptions(): unknown[];

    /** Powerful attribute/value search, e.g. "#dateModified =* MONTH AND #log". */
    searchForNotes(query: string, searchParams?: Record<string, unknown>): ScriptBNote[];
    /** Returns the first note matching the search, or null. */
    searchForNote(query: string, searchParams?: Record<string, unknown>): ScriptBNote | null;
    /** Returns all notes carrying the given label. */
    getNotesWithLabel(name: string, value?: string): ScriptBNote[];
    /** Returns the first note carrying the given label, or null. */
    getNoteWithLabel(name: string, value?: string): ScriptBNote | null;

    /** Ensures a branch exists between note and parent (creating it if needed). */
    ensureNoteIsPresentInParent(noteId: string, parentNoteId: string, prefix?: string): { branch: ScriptBBranch | null };
    /** Ensures no branch exists between note and parent (removing it if present). */
    ensureNoteIsAbsentFromParent(noteId: string, parentNoteId: string): void;
    /** Creates or removes the branch between note and parent based on `present`. */
    toggleNoteInParent(present: boolean, noteId: string, parentNoteId: string, prefix?: string): void;

    /** Creates a text note under the given parent. */
    createTextNote(parentNoteId: string, title: string, content: string): ScriptNoteAndBranch;
    /** Creates a data (JSON) note under the given parent. */
    createDataNote(parentNoteId: string, title: string, content: object): ScriptNoteAndBranch;
    /** Creates a new note with full control over its parameters. */
    createNewNote(params: {
        parentNoteId: string;
        title: string;
        content: string | Uint8Array;
        type: string;
        mime?: string;
        [key: string]: unknown;
    }): ScriptNoteAndBranch;

    /** Per-note log message buffers shown in the UI log pane. */
    logMessages: Record<string, string[]>;
    /** Per-note spaced-update handlers for the log pane. */
    logSpacedUpdates: Record<string, unknown>;
    /** Logs a message to the Trilium log and the UI log pane. */
    log(...args: unknown[]): void;

    /** Returns the root note of the calendar. */
    getRootCalendarNote(): ScriptBNote | null;
    /** Returns (creating if needed) the day-note for the given "YYYY-MM-DD" date. */
    getDayNote(date: string, rootNote?: ScriptBNote): ScriptBNote | null;
    /** Returns (creating if needed) today's day-note. */
    getTodayNote(rootNote?: ScriptBNote): ScriptBNote | null;
    /** Returns (creating if needed) the week's first day-note for the given date. */
    getWeekFirstDayNote(date: string, rootNote?: ScriptBNote): ScriptBNote | null;
    /** Returns (creating if needed) the week-note for the given date, or null if unsupported. */
    getWeekNote(date: string, rootNote?: ScriptBNote): ScriptBNote | null;
    /** Returns (creating if needed) the month-note for the given "YYYY-MM" month. */
    getMonthNote(date: string, rootNote?: ScriptBNote): ScriptBNote | null;
    /** Returns (creating if needed) the quarter-note for the given date. */
    getQuarterNote(date: string, rootNote?: ScriptBNote): ScriptBNote | null;
    /** Returns (creating if needed) the year-note for the given "YYYY" year. */
    getYearNote(year: string, rootNote?: ScriptBNote): ScriptBNote | null;

    /** Sorts the child notes of the given note. */
    sortNotes(parentNoteId: string, sortConfig: { sortBy?: string; reverse?: boolean; foldersFirst?: boolean }): void;
    /** Sets or removes a note's branch under a parent, looked up by prefix. */
    setNoteToParent(noteId: string, prefix: string, parentNoteId: string | null): void;
    /** Runs the given function inside a transaction (reusing an existing one if present). */
    transactional<T>(func: () => T): T;

    /** Returns a random (non-cryptographic) alphanumeric string of the given length. */
    randomString(length: number): string;
    /** Escapes the given HTML string. */
    escapeHtml(str: string): string;
    /** Unescapes the given HTML string. */
    unescapeHtml(str: string): string;
    /** Low-level SQL access. */
    sql: unknown;
    /** Application info (version, build date, etc.). */
    getAppInfo(): unknown;

    /** Creates or updates a launchbar launcher. */
    createOrUpdateLauncher(opts: {
        id: string;
        type: "note" | "script" | "customWidget";
        title: string;
        isVisible: boolean;
        icon: string;
        keyboardShortcut: string;
        targetNoteId?: string;
        scriptNoteId?: string;
        widgetNoteId?: string;
    }): { note: ScriptBNote };
    /** Exports a subtree to a zip file in the given format. */
    exportSubtreeToZipFile(noteId: string, format: "markdown" | "html", zipFilePath: string): Promise<void>;
    /** Executes the given function on all connected frontend instances. */
    runOnFrontend(script: (() => void) | string, params?: unknown[]): void;
    /** Runs the callback while no sync process is running. */
    runOutsideOfSync(callback: () => void): Promise<void>;
    /** Triggers a backup immediately, returning the backup file path. */
    backupNow(backupName: string): Promise<string>;
    /** Duplicates a subtree under a new parent. */
    duplicateSubtree(origNoteId: string, newParentNoteId: string): ScriptNoteAndBranch;
}
