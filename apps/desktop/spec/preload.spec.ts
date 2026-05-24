import { beforeEach, describe, expect, it, vi } from "vitest";

let exposedApi: Record<string, Record<string, unknown>> = {};
let mockZoomFactor = 1.0;
const ipcRendererListeners = new Map<string, Function[]>();
const ipcRendererSent: Array<{ channel: string; args: unknown[] }> = [];
const ipcRendererInvoked: Array<{ channel: string; args: unknown[] }> = [];
const ipcRendererSyncResults = new Map<string, unknown>();

vi.mock("electron", () => ({
    contextBridge: {
        exposeInMainWorld(apiKey: string, api: Record<string, unknown>) {
            exposedApi[apiKey] = api;
        }
    },
    webFrame: {
        setZoomFactor(factor: number) {
            mockZoomFactor = factor;
        },
        getZoomFactor() {
            return mockZoomFactor;
        }
    },
    ipcRenderer: {
        on(channel: string, listener: Function) {
            const listeners = ipcRendererListeners.get(channel) ?? [];
            listeners.push(listener);
            ipcRendererListeners.set(channel, listeners);
        },
        send(channel: string, ...args: unknown[]) {
            ipcRendererSent.push({ channel, args });
        },
        invoke(channel: string, ...args: unknown[]) {
            ipcRendererInvoked.push({ channel, args });
            return Promise.resolve("");
        },
        sendSync(channel: string, ...args: unknown[]) {
            return ipcRendererSyncResults.get(`${channel}:${args[0]}`);
        },
        removeAllListeners(channel: string) {
            ipcRendererListeners.delete(channel);
        }
    }
}));

function getApi() {
    return exposedApi.electronApi as Record<string, Function>;
}

describe("preload script", () => {
    beforeEach(async () => {
        exposedApi = {};
        mockZoomFactor = 1.0;
        ipcRendererListeners.clear();
        ipcRendererSent.length = 0;
        ipcRendererInvoked.length = 0;
        ipcRendererSyncResults.clear();
        vi.resetModules();
        await import("../src/preload.js");
    });

    it("exposes electronApi on the window", () => {
        expect(exposedApi).toHaveProperty("electronApi");
    });

    describe("zoom", () => {
        it("setZoomFactor delegates to webFrame", () => {
            getApi().setZoomFactor(1.5);
            expect(mockZoomFactor).toBe(1.5);
        });

        it("getZoomFactor delegates to webFrame", () => {
            mockZoomFactor = 0.8;
            expect(getApi().getZoomFactor()).toBe(0.8);
        });
    });

    describe("IPC listeners", () => {
        it("onGlobalShortcut registers and forwards globalShortcut channel", () => {
            const callback = vi.fn();
            getApi().onGlobalShortcut(callback);

            const listeners = ipcRendererListeners.get("globalShortcut")!;
            expect(listeners).toHaveLength(1);
            listeners[0]({}, "toggleNoteHoisting");
            expect(callback).toHaveBeenCalledWith("toggleNoteHoisting");
        });

        it("onOpenInSameTab registers and forwards openInSameTab channel", () => {
            const callback = vi.fn();
            getApi().onOpenInSameTab(callback);

            const listeners = ipcRendererListeners.get("openInSameTab")!;
            expect(listeners).toHaveLength(1);
            listeners[0]({}, "abc123");
            expect(callback).toHaveBeenCalledWith("abc123");
        });

        it("onEnterFullScreen registers and forwards enter-full-screen channel", () => {
            const callback = vi.fn();
            getApi().onEnterFullScreen(callback);

            const listeners = ipcRendererListeners.get("enter-full-screen")!;
            expect(listeners).toHaveLength(1);
            listeners[0]();
            expect(callback).toHaveBeenCalled();
        });

        it("onLeaveFullScreen registers and forwards leave-full-screen channel", () => {
            const callback = vi.fn();
            getApi().onLeaveFullScreen(callback);

            const listeners = ipcRendererListeners.get("leave-full-screen")!;
            expect(listeners).toHaveLength(1);
            listeners[0]();
            expect(callback).toHaveBeenCalled();
        });
    });

    describe("window management IPC senders", () => {
        it("setTitleBarOverlay sends correct IPC message", () => {
            getApi().setTitleBarOverlay({ color: "#fff", symbolColor: "#000" });
            expect(ipcRendererSent).toContainEqual({
                channel: "set-title-bar-overlay",
                args: [{ color: "#fff", symbolColor: "#000" }]
            });
        });

        it("setWindowButtonPosition sends correct IPC message", () => {
            getApi().setWindowButtonPosition({ x: 10, y: 20 });
            expect(ipcRendererSent).toContainEqual({
                channel: "set-window-button-position",
                args: [{ x: 10, y: 20 }]
            });
        });

        it("setBackgroundMaterial sends correct IPC message", () => {
            getApi().setBackgroundMaterial("mica");
            expect(ipcRendererSent).toContainEqual({
                channel: "set-background-material",
                args: ["mica"]
            });
        });

        it("setVibrancy sends correct IPC message", () => {
            getApi().setVibrancy("under-window");
            expect(ipcRendererSent).toContainEqual({
                channel: "set-vibrancy",
                args: ["under-window"]
            });
        });

        it("clearNavigationHistory sends correct IPC message", () => {
            getApi().clearNavigationHistory();
            expect(ipcRendererSent).toContainEqual({
                channel: "clear-navigation-history",
                args: []
            });
        });

        it("setNativeThemeSource sends correct IPC message", () => {
            getApi().setNativeThemeSource("dark");
            expect(ipcRendererSent).toContainEqual({
                channel: "set-native-theme-source",
                args: ["dark"]
            });
        });

        it("webContentsAction sends action and optional text", () => {
            getApi().webContentsAction("cut");
            expect(ipcRendererSent).toContainEqual({
                channel: "web-contents-action",
                args: ["cut", undefined]
            });

            getApi().webContentsAction("insertText", "hello");
            expect(ipcRendererSent).toContainEqual({
                channel: "web-contents-action",
                args: ["insertText", "hello"]
            });
        });

        it("openExternal sends correct IPC message", () => {
            getApi().openExternal("https://example.com");
            expect(ipcRendererSent).toContainEqual({
                channel: "open-external",
                args: ["https://example.com"]
            });
        });

        it("openPath invokes correct IPC channel", async () => {
            await getApi().openPath("/tmp/test.txt");
            expect(ipcRendererInvoked).toContainEqual({
                channel: "open-path",
                args: ["/tmp/test.txt"]
            });
        });

        it("openFileUrl invokes correct IPC channel", async () => {
            await getApi().openFileUrl("file:///tmp/test.txt");
            expect(ipcRendererInvoked).toContainEqual({
                channel: "open-file-url",
                args: ["file:///tmp/test.txt"]
            });
        });

        it("toggleDevTools sends correct IPC message", () => {
            getApi().toggleDevTools();
            expect(ipcRendererSent).toContainEqual({
                channel: "toggle-dev-tools",
                args: []
            });
        });

        it("isFullScreen uses sendSync", () => {
            ipcRendererSyncResults.set("is-full-screen:undefined", true);
            expect(getApi().isFullScreen()).toBe(true);
        });

        it("setFullScreen sends correct IPC message", () => {
            getApi().setFullScreen(true);
            expect(ipcRendererSent).toContainEqual({
                channel: "set-full-screen",
                args: [true]
            });
        });

        it("createExtraWindow sends correct IPC message", () => {
            getApi().createExtraWindow("#root/abc123");
            expect(ipcRendererSent).toContainEqual({
                channel: "create-extra-window",
                args: [{ extraWindowHash: "#root/abc123" }]
            });
        });

        it("isAlwaysOnTop uses sendSync", () => {
            ipcRendererSyncResults.set("is-always-on-top:undefined", true);
            expect(getApi().isAlwaysOnTop()).toBe(true);
        });

        it("setAlwaysOnTop sends correct IPC message", () => {
            getApi().setAlwaysOnTop(true);
            expect(ipcRendererSent).toContainEqual({
                channel: "set-always-on-top",
                args: [true]
            });
        });

        it("reloadTray sends correct IPC message", () => {
            getApi().reloadTray();
            expect(ipcRendererSent).toContainEqual({
                channel: "reload-tray",
                args: []
            });
        });

        it("addWordToDictionary sends correct IPC message", () => {
            getApi().addWordToDictionary("trilium");
            expect(ipcRendererSent).toContainEqual({
                channel: "add-word-to-dictionary",
                args: ["trilium"]
            });
        });
    });

    describe("context menu listener", () => {
        it("onContextMenu registers and forwards context-menu channel", () => {
            const callback = vi.fn();
            getApi().onContextMenu(callback);

            const listeners = ipcRendererListeners.get("context-menu")!;
            expect(listeners).toHaveLength(1);

            const params = { x: 100, y: 200, selectionText: "test" };
            listeners[0]({}, params);
            expect(callback).toHaveBeenCalledWith(params);
        });
    });

    describe("printing", () => {
        it("onPrintProgress registers and forwards print-progress channel", () => {
            const callback = vi.fn();
            getApi().onPrintProgress(callback);

            const listeners = ipcRendererListeners.get("print-progress")!;
            expect(listeners).toHaveLength(1);
            listeners[0]({}, { progress: 50, action: "printing" });
            expect(callback).toHaveBeenCalledWith({ progress: 50, action: "printing" });
        });

        it("onPrintDone registers and forwards print-done channel", () => {
            const callback = vi.fn();
            getApi().onPrintDone(callback);

            const listeners = ipcRendererListeners.get("print-done")!;
            expect(listeners).toHaveLength(1);
            listeners[0]({}, { success: true });
            expect(callback).toHaveBeenCalledWith({ success: true });
        });

        it("sendPrintProgress sends correct IPC message", () => {
            getApi().sendPrintProgress(50);
            expect(ipcRendererSent).toContainEqual({
                channel: "print-progress",
                args: [50]
            });
        });

        it("removePrintListeners clears both print listeners", () => {
            getApi().onPrintProgress(vi.fn());
            getApi().onPrintDone(vi.fn());
            expect(ipcRendererListeners.has("print-progress")).toBe(true);
            expect(ipcRendererListeners.has("print-done")).toBe(true);

            getApi().removePrintListeners();
            expect(ipcRendererListeners.has("print-progress")).toBe(false);
            expect(ipcRendererListeners.has("print-done")).toBe(false);
        });
    });

    describe("print preview", () => {
        it("getPrinters invokes correct IPC channel", async () => {
            await getApi().getPrinters();
            expect(ipcRendererInvoked).toContainEqual({
                channel: "get-printers",
                args: []
            });
        });

        it("exportAsPdfPreview sends correct IPC message", () => {
            const opts = { notePath: "root/abc", pageSize: "A4" };
            getApi().exportAsPdfPreview(opts);
            expect(ipcRendererSent).toContainEqual({
                channel: "export-as-pdf-preview",
                args: [opts]
            });
        });

        it("onExportAsPdfPreviewResult registers and forwards channel", () => {
            const callback = vi.fn();
            getApi().onExportAsPdfPreviewResult(callback);

            const listeners = ipcRendererListeners.get("export-as-pdf-preview-result")!;
            expect(listeners).toHaveLength(1);
            const result = { buffer: new Uint8Array([1, 2, 3]) };
            listeners[0]({}, result);
            expect(callback).toHaveBeenCalledWith(result);
        });

        it("removeExportAsPdfPreviewResultListener clears listener", () => {
            getApi().onExportAsPdfPreviewResult(vi.fn());
            expect(ipcRendererListeners.has("export-as-pdf-preview-result")).toBe(true);
            getApi().removeExportAsPdfPreviewResultListener();
            expect(ipcRendererListeners.has("export-as-pdf-preview-result")).toBe(false);
        });

        it("savePdf sends correct IPC message", () => {
            const data = { title: "Test", buffer: new Uint8Array([1]) };
            getApi().savePdf(data);
            expect(ipcRendererSent).toContainEqual({
                channel: "save-pdf",
                args: [data]
            });
        });

        it("printFromPreview sends correct IPC message", () => {
            const opts = { notePath: "root/abc", silent: true };
            getApi().printFromPreview(opts);
            expect(ipcRendererSent).toContainEqual({
                channel: "print-from-preview",
                args: [opts]
            });
        });
    });

    describe("navigation history", () => {
        it("navigationCanGoBack uses sendSync", () => {
            ipcRendererSyncResults.set("navigation-history:canGoBack", true);
            expect(getApi().navigationCanGoBack()).toBe(true);
        });

        it("navigationCanGoForward uses sendSync", () => {
            ipcRendererSyncResults.set("navigation-history:canGoForward", false);
            expect(getApi().navigationCanGoForward()).toBe(false);
        });

        it("navigationGetAllEntries uses sendSync", () => {
            const entries = [{ url: "trilium-app://app/?#abc", title: "Note" }];
            ipcRendererSyncResults.set("navigation-history:getAllEntries", entries);
            expect(getApi().navigationGetAllEntries()).toEqual(entries);
        });

        it("navigationGetActiveIndex uses sendSync", () => {
            ipcRendererSyncResults.set("navigation-history:getActiveIndex", 3);
            expect(getApi().navigationGetActiveIndex()).toBe(3);
        });

        it("navigationLength uses sendSync", () => {
            ipcRendererSyncResults.set("navigation-history:length", 5);
            expect(getApi().navigationLength()).toBe(5);
        });

        it("navigationGoToIndex sends correct IPC message", () => {
            getApi().navigationGoToIndex(2);
            expect(ipcRendererSent).toContainEqual({
                channel: "navigation-history-go-to-index",
                args: [2]
            });
        });

        it("onDidNavigate registers and forwards did-navigate channel", () => {
            const callback = vi.fn();
            getApi().onDidNavigate(callback);

            const listeners = ipcRendererListeners.get("did-navigate")!;
            expect(listeners).toHaveLength(1);
            listeners[0]();
            expect(callback).toHaveBeenCalled();
        });

        it("removeDidNavigateListeners clears both navigation listeners", () => {
            getApi().onDidNavigate(vi.fn());
            getApi().onDidNavigateInPage(vi.fn());
            expect(ipcRendererListeners.has("did-navigate")).toBe(true);
            expect(ipcRendererListeners.has("did-navigate-in-page")).toBe(true);

            getApi().removeDidNavigateListeners();
            expect(ipcRendererListeners.has("did-navigate")).toBe(false);
            expect(ipcRendererListeners.has("did-navigate-in-page")).toBe(false);
        });
    });
});
