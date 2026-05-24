export interface ElectronContextMenuParams {
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

export interface ElectronWindowApi {
    // Zoom
    setZoomFactor(factor: number): void;
    getZoomFactor(): number;

    // Theme
    setNativeThemeSource(source: "system" | "light" | "dark"): void;

    // Title bar
    setTitleBarOverlay(options: { color: string; symbolColor: string }): void;
    setWindowButtonPosition(position: { x: number; y: number }): void;

    // Full screen
    onEnterFullScreen(callback: () => void): void;
    onLeaveFullScreen(callback: () => void): void;
    isFullScreen(): boolean;
    setFullScreen(enabled: boolean): void;

    // Window state
    minimizeWindow(): void;
    maximizeWindow(): void;
    unmaximizeWindow(): void;
    isMaximized(): boolean;
    closeWindow(): void;
    createExtraWindow(extraWindowHash: string): void;
    isAlwaysOnTop(): boolean;
    setAlwaysOnTop(enabled: boolean): void;
    toggleDevTools(): void;

    // Background effects
    setBackgroundMaterial(material: string): void;
    setVibrancy(vibrancy: string): void;

    // App lifecycle
    reloadAllWindows(): void;
    restartApp(): void;
    toggleAllWindows(): void;
    clearCache(): Promise<void>;

    // Main → renderer events
    onGlobalShortcut(callback: (actionName: string) => void): void;
    onOpenInSameTab(callback: (noteId: string) => void): void;
}

export interface ElectronShellApi {
    openExternal(url: string): void;
    openPath(path: string): Promise<string>;
    openFileUrl(fileUrl: string): Promise<string>;
}

export interface ElectronContextMenuApi {
    onContextMenu(callback: (params: ElectronContextMenuParams) => void): void;
    webContentsAction(action: "cut" | "copy" | "paste" | "pasteAndMatchStyle" | "insertText", text?: string): void;
}

export interface ElectronSpellcheckApi {
    addWordToDictionary(word: string): void;
    getAvailableSpellCheckerLanguages(): string[];
}

export interface ElectronTrayApi {
    reloadTray(): void;
}

export interface ElectronPrintingApi {
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
}

export interface ElectronNavigationApi {
    clearNavigationHistory(): void;
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

export interface ElectronApi {
    window: ElectronWindowApi;
    shell: ElectronShellApi;
    contextMenu: ElectronContextMenuApi;
    spellcheck: ElectronSpellcheckApi;
    tray: ElectronTrayApi;
    printing: ElectronPrintingApi;
    navigation: ElectronNavigationApi;
}
