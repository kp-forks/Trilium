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

    // Dictionary
    addWordToDictionary(word: string) {
        ipcRenderer.send("add-word-to-dictionary", word);
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
