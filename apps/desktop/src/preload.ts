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
    }
});
