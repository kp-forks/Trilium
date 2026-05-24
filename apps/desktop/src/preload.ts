import { contextBridge, ipcRenderer, webFrame } from "electron";

contextBridge.exposeInMainWorld("electronApi", {
    // Zoom
    setZoomFactor(factor: number) {
        webFrame.setZoomFactor(factor);
    },
    getZoomFactor(): number {
        return webFrame.getZoomFactor();
    },

    // IPC: main → renderer (whitelisted channels only)
    onGlobalShortcut(callback: (actionName: string) => void) {
        ipcRenderer.on("globalShortcut", (_event, actionName) => callback(actionName));
    },
    onOpenInSameTab(callback: (noteId: string) => void) {
        ipcRenderer.on("openInSameTab", (_event, noteId) => callback(noteId));
    },

    // Window management (forwarded to main process via IPC)
    setTitleBarOverlay(options: { color: string; symbolColor: string }) {
        ipcRenderer.send("set-title-bar-overlay", options);
    },
    setWindowButtonPosition(position: { x: number; y: number }) {
        ipcRenderer.send("set-window-button-position", position);
    },
    onEnterFullScreen(callback: () => void) {
        ipcRenderer.on("enter-full-screen", () => callback());
    },
    onLeaveFullScreen(callback: () => void) {
        ipcRenderer.on("leave-full-screen", () => callback());
    },
    setBackgroundMaterial(material: string) {
        ipcRenderer.send("set-background-material", material);
    },
    setVibrancy(vibrancy: string) {
        ipcRenderer.send("set-vibrancy", vibrancy);
    },
    clearNavigationHistory() {
        ipcRenderer.send("clear-navigation-history");
    },

    // Theme
    setNativeThemeSource(source: "system" | "light" | "dark") {
        ipcRenderer.send("set-native-theme-source", source);
    },

    // Context menu
    onContextMenu(callback: (params: ContextMenuParams) => void) {
        ipcRenderer.on("context-menu", (_event, params: ContextMenuParams) => callback(params));
    },
    webContentsAction(action: "cut" | "copy" | "paste" | "pasteAndMatchStyle" | "insertText", text?: string) {
        ipcRenderer.send("web-contents-action", action, text);
    },

    // Shell
    openExternal(url: string) {
        ipcRenderer.send("open-external", url);
    },
    openPath(path: string): Promise<string> {
        return ipcRenderer.invoke("open-path", path);
    },
    openFileUrl(fileUrl: string): Promise<string> {
        return ipcRenderer.invoke("open-file-url", fileUrl);
    },

    // Window state
    isAlwaysOnTop(): boolean {
        return ipcRenderer.sendSync("is-always-on-top");
    },
    setAlwaysOnTop(enabled: boolean) {
        ipcRenderer.send("set-always-on-top", enabled);
    },
    toggleDevTools() {
        ipcRenderer.send("toggle-dev-tools");
    },
    isFullScreen(): boolean {
        return ipcRenderer.sendSync("is-full-screen");
    },
    setFullScreen(enabled: boolean) {
        ipcRenderer.send("set-full-screen", enabled);
    },
    createExtraWindow(extraWindowHash: string) {
        ipcRenderer.send("create-extra-window", { extraWindowHash });
    },

    // Tray
    reloadTray() {
        ipcRenderer.send("reload-tray");
    },

    // Dictionary
    addWordToDictionary(word: string) {
        ipcRenderer.send("add-word-to-dictionary", word);
    },

    // Printing
    sendPrintProgress(progress: number) {
        ipcRenderer.send("print-progress", progress);
    },
    onPrintProgress(callback: (data: { progress: number; action: string }) => void) {
        ipcRenderer.on("print-progress", (_event, data) => callback(data));
    },
    onPrintDone(callback: (printReport: unknown) => void) {
        ipcRenderer.on("print-done", (_event, printReport) => callback(printReport));
    },
    removePrintListeners() {
        ipcRenderer.removeAllListeners("print-progress");
        ipcRenderer.removeAllListeners("print-done");
    },
    getPrinters(): Promise<unknown[]> {
        return ipcRenderer.invoke("get-printers");
    },
    exportAsPdfPreview(opts: Record<string, unknown>) {
        ipcRenderer.send("export-as-pdf-preview", opts);
    },
    onExportAsPdfPreviewResult(callback: (result: { buffer?: Uint8Array; error?: string }) => void) {
        ipcRenderer.on("export-as-pdf-preview-result", (_event, result) => callback(result));
    },
    removeExportAsPdfPreviewResultListener() {
        ipcRenderer.removeAllListeners("export-as-pdf-preview-result");
    },
    savePdf(data: { title: string; buffer: Uint8Array }) {
        ipcRenderer.send("save-pdf", data);
    },
    printFromPreview(opts: Record<string, unknown>) {
        ipcRenderer.send("print-from-preview", opts);
    },

    // Navigation history
    navigationCanGoBack(): boolean {
        return ipcRenderer.sendSync("navigation-history", "canGoBack");
    },
    navigationCanGoForward(): boolean {
        return ipcRenderer.sendSync("navigation-history", "canGoForward");
    },
    navigationGetAllEntries(): Array<{ url: string; title: string }> {
        return ipcRenderer.sendSync("navigation-history", "getAllEntries");
    },
    navigationGetActiveIndex(): number {
        return ipcRenderer.sendSync("navigation-history", "getActiveIndex");
    },
    navigationLength(): number {
        return ipcRenderer.sendSync("navigation-history", "length");
    },
    navigationGoToIndex(index: number) {
        ipcRenderer.send("navigation-history-go-to-index", index);
    },
    onDidNavigate(callback: () => void) {
        ipcRenderer.on("did-navigate", () => callback());
    },
    onDidNavigateInPage(callback: () => void) {
        ipcRenderer.on("did-navigate-in-page", () => callback());
    },
    removeDidNavigateListeners() {
        ipcRenderer.removeAllListeners("did-navigate");
        ipcRenderer.removeAllListeners("did-navigate-in-page");
    }
});

interface ContextMenuParams {
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
