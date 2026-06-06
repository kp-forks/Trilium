/**
 * Ambient type definitions fed to the TypeScript language service when editing
 * a **backend** script note (`application/javascript;env=backend`).
 *
 * Hand-curated subset of the real `Api` interface declared in
 * `packages/trilium-core/src/services/backend_script_api.ts`. Standalone `.d.ts`
 * (no imports) for the same reason as the frontend stub.
 *
 * Follow-up (see PoC notes): auto-generate from the live source at build time.
 */
export default /* ts */ `
interface BAttribute {
    attributeId: string;
    type: "label" | "relation";
    name: string;
    value: string;
    isInheritable: boolean;
}

interface BNote {
    noteId: string;
    title: string;
    type: string;
    mime: string;
    isProtected: boolean;
    getContent(): string | Buffer;
    setContent(content: string | Buffer, opts?: { forceSave?: boolean }): void;
    getParentNotes(): BNote[];
    getChildNotes(): BNote[];
    getAttributes(type?: string, name?: string): BAttribute[];
    getOwnedAttributes(type?: string, name?: string): BAttribute[];
    getLabelValue(name: string): string | null;
    hasLabel(name: string): boolean;
    setLabel(name: string, value?: string): BAttribute;
    setRelation(name: string, targetNoteId: string): BAttribute;
    getRelationTarget(name: string): BNote | null;
}

interface BBranch {
    branchId: string;
    noteId: string;
    parentNoteId: string;
    prefix: string | null;
    notePosition: number;
    isExpanded: boolean;
}

interface CreateNoteResult {
    note: BNote;
    branch: BBranch;
}

/** Trilium backend script API, exposed to "JS backend" code notes as the global \`api\`. */
interface BackendApi {
    /** Note where the script started executing (the event entrypoint). */
    startNote: BNote;
    /** Note where the script is currently executing. */
    currentNote: BNote;
    /** Entity whose event triggered this execution (or null). */
    originEntity: unknown | null;

    /** day.js instance for date manipulation. */
    dayjs: (date?: string | number | Date) => { format(template: string): string };
    /** axios HTTP client. */
    axios: unknown;
    /** cheerio HTML parser. */
    cheerio: unknown;

    /** Returns a note by its ID, or null. */
    getNote(noteId: string): BNote | null;
    /** Returns a branch by its ID, or null. */
    getBranch(branchId: string): BBranch | null;
    /** Returns an attribute by its ID, or null. */
    getAttribute(attributeId: string): BAttribute | null;

    /** Powerful attribute/value search, e.g. "#dateModified =* MONTH AND #log". */
    searchForNotes(searchString: string, params?: Record<string, unknown>): BNote[];
    /** Returns the first note matching the search, or null. */
    searchForNote(searchString: string, params?: Record<string, unknown>): BNote | null;
    /** Returns all notes carrying the given label. */
    getNotesWithLabel(name: string, value?: string): BNote[];
    /** Returns the first note carrying the given label, or null. */
    getNoteWithLabel(name: string, value?: string): BNote | null;

    /** Creates a new note under the given parent. */
    createNewNote(params: {
        parentNoteId: string;
        title: string;
        content: string | Buffer;
        type: string;
        mime?: string;
    }): CreateNoteResult;
    /** Convenience: create a text note. */
    createTextNote(parentNoteId: string, title: string, content: string): CreateNoteResult;
    /** Convenience: create a data (JSON) note. */
    createDataNote(parentNoteId: string, title: string, content: object): CreateNoteResult;

    /** Calendar helpers. */
    getDayNote(date: string, rootNote?: BNote): BNote;
    getTodayNote(rootNote?: BNote): BNote;
    getWeekNote(date: string, rootNote?: BNote): BNote;
    getMonthNote(month: string, rootNote?: BNote): BNote;
    getYearNote(year: string, rootNote?: BNote): BNote;
    getRootCalendarNote(): BNote;

    /** Reads an option value. */
    getOption(name: string): string;
    /** Reads all options. */
    getOptions(): Record<string, string>;
    /** Application info (version, build date, etc.). */
    getAppInfo(): Record<string, unknown>;

    /** Runs the given function inside a transaction. */
    transactional<T>(func: () => T): T;
    /** Runs the given function on the frontend of all connected clients. */
    runOnFrontend(func: (...args: unknown[]) => unknown, params?: unknown[]): Promise<unknown>;
    /** Triggers a full backup immediately. */
    backupNow(backupName: string): Promise<string>;

    /** Writes a line to the script log. */
    log(message: string): void;
    /** Generates a random alphanumeric string of the given length. */
    randomString(length: number): string;
    /** Escapes the given HTML string. */
    escapeHtml(html: string): string;
    /** Unescapes the given HTML string. */
    unescapeHtml(html: string): string;

    /** Low-level SQL access. */
    sql: {
        getRow<T>(query: string, params?: unknown[]): T;
        getRows<T>(query: string, params?: unknown[]): T[];
        getValue<T>(query: string, params?: unknown[]): T;
        execute(query: string, params?: unknown[]): unknown;
    };
}

declare const api: BackendApi;
`;
