import { BootstrapDefinition } from "@triliumnext/commons";

import appContext, { AppContext } from "./components/app_context";
import type FNote from "./entities/fnote";
import type { PrintReport } from "./print";
import type { lint } from "./services/eslint";
import type { Froca } from "./services/froca-interface";
import { Library } from "./services/library_loader";
import { Suggestion } from "./services/note_autocomplete";
import server from "./services/server";
import utils from "./services/utils";

interface ElectronProcess {
    type: string;
    platform: string;
}

interface CustomGlobals extends BootstrapDefinition {
    isDesktop: typeof utils.isDesktop;
    isMobile: typeof utils.isMobile;
    getComponentByEl: typeof appContext.getComponentByEl;
    getHeaders: typeof server.getHeaders;
    getReferenceLinkTitle: (href: string) => Promise<string>;
    getReferenceLinkTitleSync: (href: string) => string;
    getActiveContextNote: () => FNote | null;
    getThemeStyle: () => "auto" | "light" | "dark";
    ESLINT: Library;
    appContext: AppContext;
    froca: Froca;
    treeCache: Froca;
    SEARCH_HELP_TEXT: string;
    activeDialog: JQuery<HTMLElement> | null;
    componentId: string;
    linter: typeof lint;
}

type RequireMethod = (moduleName: string) => any;

declare global {
    interface Window {
        $: JQueryStatic;
        jQuery: JQueryStatic;

        logError(message: string);
        logInfo(message: string);

        process?: ElectronProcess;
        glob?: CustomGlobals;

        /** On the printing endpoint, set to true when the note has fully loaded and is ready to be printed/exported as PDF. */
        _noteReady?: PrintReport;

        EXCALIDRAW_ASSET_PATH?: string;

        Capacitor?: {
            isNativePlatform?: () => boolean;
            getPlatform?: () => string;
        };

        electronApi?: ElectronApi;
    }

    interface ElectronApi {
        setZoomFactor(factor: number): void;
        getZoomFactor(): number;
        onGlobalShortcut(callback: (actionName: string) => void): void;
        onOpenInSameTab(callback: (noteId: string) => void): void;
        setTitleBarOverlay(options: { color: string; symbolColor: string }): void;
        setWindowButtonPosition(position: { x: number; y: number }): void;
        onEnterFullScreen(callback: () => void): void;
        onLeaveFullScreen(callback: () => void): void;
        toggleDevTools(): void;
        isFullScreen(): boolean;
        setFullScreen(enabled: boolean): void;
        isAlwaysOnTop(): boolean;
        setAlwaysOnTop(enabled: boolean): void;
        minimizeWindow(): void;
        maximizeWindow(): void;
        unmaximizeWindow(): void;
        isMaximized(): boolean;
        closeWindow(): void;
        createExtraWindow(extraWindowHash: string): void;
        setBackgroundMaterial(material: string): void;
        setVibrancy(vibrancy: string): void;
        clearNavigationHistory(): void;
        setNativeThemeSource(source: "system" | "light" | "dark"): void;
        onContextMenu(callback: (params: ElectronContextMenuParams) => void): void;
        webContentsAction(action: "cut" | "copy" | "paste" | "pasteAndMatchStyle" | "insertText", text?: string): void;
        openExternal(url: string): void;
        openPath(path: string): Promise<string>;
        openFileUrl(fileUrl: string): Promise<string>;
        reloadTray(): void;
        addWordToDictionary(word: string): void;
        getAvailableSpellCheckerLanguages(): string[];
        sendPrintProgress(progress: number): void;
        onPrintProgress(callback: (data: { progress: number; action: string }) => void): void;
        onPrintDone(callback: (printReport: unknown) => void): void;
        removePrintListeners(): void;
        getPrinters(): Promise<unknown[]>;
        exportAsPdfPreview(opts: Record<string, unknown>): void;
        onExportAsPdfPreviewResult(callback: (result: { buffer?: Uint8Array; error?: string }) => void): void;
        removeExportAsPdfPreviewResultListener(): void;
        savePdf(data: { title: string; buffer: Uint8Array }): void;
        printFromPreview(opts: Record<string, unknown>): void;
        navigationCanGoBack(): boolean;
        navigationCanGoForward(): boolean;
        navigationGetAllEntries(): Array<{ url: string; title: string }>;
        navigationGetActiveIndex(): number;
        navigationLength(): number;
        navigationGoToIndex(index: number): void;
        onDidNavigate(callback: () => void): void;
        onDidNavigateInPage(callback: () => void): void;
        removeDidNavigateListeners(): void;
    }

    interface ElectronContextMenuParams {
        x: number;
        y: number;
        linkURL: string;
        linkText: string;
        mediaType: string;
        isEditable: boolean;
        selectionText: string;
        misspelledWord: string;
        dictionarySuggestions: string[];
        editFlags: {
            canCut: boolean;
            canCopy: boolean;
            canPaste: boolean;
        };
    }

    interface WindowEventMap {
        "note-ready": Event;
        "note-load-progress": CustomEvent<{ progress: number }>;
    }

    interface AutoCompleteConfig {
        appendTo?: HTMLElement | null;
        hint?: boolean;
        openOnFocus?: boolean;
        minLength?: number;
        tabAutocomplete?: boolean;
        autoselect?: boolean;
        dropdownMenuContainer?: HTMLElement;
        debug?: boolean;
    }

    type AutoCompleteCallback = (values: AutoCompleteArg[]) => void;

    interface AutoCompleteArg {
        name?: string;
        value?: string;
        notePathTitle?: string;
        displayKey?: "name" | "value" | "notePathTitle";
        cache?: boolean;
        source?: (term: string, cb: AutoCompleteCallback) => void,
        templates?: {
            suggestion: (suggestion: Suggestion) => string | undefined
        }
    }

    interface JQuery {
        autocomplete: (action?: "close" | "open" | "destroy" | "val" | AutoCompleteConfig, args?: AutoCompleteArg[] | string) => JQuery<HTMLElement>;

        getSelectedNotePath(): string | undefined;
        getSelectedNoteId(): string | null;
        setSelectedNotePath(notePath: string | null | undefined);
        getSelectedExternalLink(): string | undefined;
        setSelectedExternalLink(externalLink: string | null | undefined);
        setNote(noteId: string);
    }

    var logError: (message: string, e?: unknown) => void;
    var logInfo: (message: string) => void;
    var glob: CustomGlobals;
    //@ts-ignore
    var require: RequireMethod;
    var __non_webpack_require__: RequireMethod | undefined;

    /*
     * Panzoom
     */

    function panzoom(el: HTMLElement, opts: {
        maxZoom: number,
        minZoom: number,
        smoothScroll: false,
        filterKey: (e: { altKey: boolean }, dx: number, dy: number, dz: number) => void;
    });

    interface PanZoomTransform {
        x: number;
        y: number;
        scale: number;
    }

    interface PanZoom {
        zoomTo(x: number, y: number, scale: number);
        moveTo(x: number, y: number);
        on(event: string, callback: () => void);
        getTransform(): PanZoomTransform;
        dispose(): void;
    }
}
