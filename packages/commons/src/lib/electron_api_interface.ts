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

export interface ElectronApi {
    // Zoom
    setZoomFactor(factor: number): void;
    getZoomFactor(): number;

    // IPC: main → renderer
    onGlobalShortcut(callback: (actionName: string) => void): void;
    onOpenInSameTab(callback: (noteId: string) => void): void;

    // Window management
    setTitleBarOverlay(options: { color: string; symbolColor: string }): void;
    setWindowButtonPosition(position: { x: number; y: number }): void;
    onEnterFullScreen(callback: () => void): void;
    onLeaveFullScreen(callback: () => void): void;
    setBackgroundMaterial(material: string): void;
    setVibrancy(vibrancy: string): void;
    clearNavigationHistory(): void;

    // Theme
    setNativeThemeSource(source: "system" | "light" | "dark"): void;

    // Context menu
    onContextMenu(callback: (params: ElectronContextMenuParams) => void): void;
    webContentsAction(action: "cut" | "copy" | "paste" | "pasteAndMatchStyle" | "insertText", text?: string): void;

    // Shell
    openExternal(url: string): void;
    openPath(path: string): Promise<string>;
    openFileUrl(fileUrl: string): Promise<string>;

    // Window state
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

    // Tray
    reloadTray(): void;

    // Dictionary / Spellcheck
    addWordToDictionary(word: string): void;
    getAvailableSpellCheckerLanguages(): string[];

    // Printing
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

    // Navigation history
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
